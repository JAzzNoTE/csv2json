const fs = require('fs');
const axios = require('axios');
const iconv = require('iconv-lite');
const csvParser = require('papaparse');

const converter = require('string-converter');

let eeNode_cache;

function isJsonFile(str) { return str.slice(-4).toLowerCase() === 'json'; }

/**
 * Converts a string or an array of strings to a number or an array of numbers.
 * @param {string} numType - The desired number type. Can be 'int' or 'float'.
 * @param {string|Array<string>} value - The string or array of strings to be converted.
 * @param {boolean} allowNull - If true, allows the function to return null for null-like input values.
 * @returns {number|Array<number>|null} The converted number, array of numbers, or null.
 */
function formatNumber(numType, value, allowNull) {
  if (Array.isArray(value)) return value.map(v => parseNumber(numType, v));
  else if (allowNull && converter.checkNull(value)) return null;
  else return parseNumber(numType, value);

  function parseNumber(numType, str) {
    const num = converter.string2Number(str);
    return (numType === 'int') ? parseInt(num) : parseFloat(num);
  }
}

/**
 * Formats a single data object (document) based on a set of formatting rules.
 * @param {object} doc - The data object to be formatted, typically representing a row from the CSV/JSON.
 * @param {object} format - An object containing formatting rules.
 * @param {Array<string>} [format.keep] - An array of property names to keep. If specified, all other properties are discarded.
 * @param {boolean} [format.allowSpace=false] - If true, preserves whitespace in string values. Defaults to false, removing spaces.
 * @param {boolean} [format.allowNull] - If true, allows conversion of null-like values to `null` for numeric and boolean types.
 * @param {Array<string>} [format.comma2Array] - An array of property names whose string values should be split by commas into an array.
 * @param {Array<string>} [format.semicolon2Array] - An array of property names whose string values should be split by semicolons into an array.
 * @param {Array<string>} [format.toBool] - An array of property names whose values should be converted to booleans.
 * @param {Array<string>} [format.toInt] - An array of property names whose values should be converted to integers.
 * @param {Array<string>} [format.toFloat] - An array of property names whose values should be converted to floating-point numbers.
 * @param {Array<string>} [format.toString] - An array of property names whose values should be explicitly cast to strings, preserving original whitespace.
 * @returns {object} The new, formatted data object.
 */
function _formatDoc(doc, format) {
  let docNew = {};
  let numType;

  for (let n in doc) {
    if (doc[n] === "") continue;

    // Delete unwanted data
    if (format.keep && format.keep.indexOf(n) < 0) continue;

    // Default to be false
    if (!format.allowSpace) docNew[n] = converter.removeSpace(doc[n]);

    // Split to array first
    if (format.comma2Array && format.comma2Array.some(name => name === n)) docNew[n] = converter.splitByComma(doc[n]);
    else if (format.semicolon2Array && format.semicolon2Array.some(name => name === n)) docNew[n] = converter.splitBySemicolon(doc[n]);

    if (format.toBool && format.toBool.some(name => name === n)) {
      // 如果是array，則轉換array內的所有值
      if (Array.isArray(doc[n])) {
        docNew[n] = doc[n].map(v => converter.convertBoolString(v));
      } else {
        docNew[n] = converter.convertBoolString(doc[n]);
        (format.allowNull && converter.checkNull(doc[n])) ? (docNew[n] = null) : null;
      }
      continue;
    }

    if (format.toInt && format.toInt.some(name => name === n)) numType = 'int';
    else if (format.toFloat && format.toFloat.some(name => name === n)) numType = 'float';

    if (numType) {
      docNew[n] = formatNumber(numType, doc[n], format.allowNull);
      continue;
    }

    //! 指定為字串型別的資料，其空白會被保留
    if (Array.isArray(format.toString) && format.toString.some(name => name === n)) docNew[n] = '' + doc[n];
  }

  return docNew;
}

// For independed from any customed module, here did not import 'file.js'
async function _readFile(file, encoding) {
  try {
    let buffer = await fs.promises.readFile(file);
    return iconv.decode(buffer, encoding);
  } catch (err) {
    console.warn(`csv2json | Read file error: ${file}`, err);
  }
}

/**
 * The main process to handle data
 * @param {object}   setting
 * @param {number}   index   - only for broadcast use
 * @param {function} resolve - passed from promise
 */
function _complete(setting, /*optional*/index, resolve) {
  return function (results, file) {
    let data, dataFormatted;
    //console.log('csv2json._complete', results) // For dev

    // Loading data from papaparse
    if (Array.isArray(results.data) && results.meta !== undefined) data = results.data;
    // Loading from json
    else data = results;

    data = (setting.filter !== undefined) ? _filter(data, setting.filter, setting.format) : data;
    dataFormatted = data.map(v => _formatDoc(v, setting.format));
    dataFormatted = (setting.success) ? setting.success(dataFormatted) : dataFormatted;

    _broadcastEvent(dataFormatted, index, setting.eventName);
    if (resolve) resolve(dataFormatted);
  };

  //! 目前僅容許用單一欄位篩選
  // Usage: (data, {name: value})
  function _filter(data, filter, format) {
    const keys = Object.keys(filter);
    const n = keys[0];
    const v = filter[n];

    return data.filter(function (doc) {
      if (!format.allowSpace) doc[n] = converter.removeSpace(doc[n]);
      return (doc[n]) ? doc[n] === v : false;
    });
  }

  function _broadcastEvent(data, index, /*optional*/eventName) {
    eventName = eventName || eeNode_cache.eventList.csv2jsonComplete;
    // unsolved: if use async/await, sometimes eeNode_cache will be undefined
    if (eeNode_cache !== undefined) eeNode_cache.emit(eventName, data, index);
  }
}

async function loadJSON(setting, /*optional*/index) {
  // The default encoding is 'UTF8', or you can specify 'big5'
  setting.encoding = setting.encoding || 'utf8';

  return new Promise(async (resolve, reject) => {
    if (setting.json) return _runJSON(setting.json);

    if (setting.file) {
      let data = await _readFile(setting.file, setting.encoding);
      return _runJSON(data);
    }

    if (setting.download) {
      try {
        let resBody = await axios.get(setting.download, { responseType: 'arraybuffer' });
        return _runJSON(iconv.decode(resBody.data, setting.encoding));
      } catch (err) {
        console.error('csv2json | Error | downloads json data failed', setting, err);
        reject({ err: err, setting: setting });
      }
    }

    function _runJSON(jsonRaw) {
      let json = (setting.before) ? setting.before(jsonRaw) : jsonRaw;
      //! Handle data without papaparse, execute 'complete' function manually
      // NOTICE: passing resolve for returning promise of loadJSON
      _complete(setting, index, resolve)(json);
    }
  });
}

function parseCSV(setting, /*optional*/index) {
  // The default encoding is 'UTF8', or you can specify 'big5'
  setting.encoding = setting.encoding || 'utf8';

  return new Promise(async (resolve, reject) => {
    let config_papaparse = {
      // Allow parsing strings to numbers and booleans (automatically?)
      // DEBUG: 解決以往數字字串字首被去0的問題
      dynamicTyping: false,
      // Set the first row as title
      header: (setting.header !== undefined) ? setting.header : true,
      //! papaparse will execute this callback automatically
      complete: _complete(setting, index, resolve)
    };
    let csvString, resBody;

    // DEBUG: setting.csvString.length == 0 for empty string
    if (setting.csvString || setting.csvString?.length == 0) return _runCSV(setting.csvString);

    if (setting.file) {
      csvString = await _readFile(setting.file, setting.encoding);
      return _runCSV(csvString);
    }

    if (setting.download) {
      try {
        // axios did not support encoding 'big5. use iconv.decode instead
        resBody = await axios.get(setting.download, { responseType: 'arraybuffer' });
        _runCSV(iconv.decode(resBody.data, setting.encoding));
      } catch (err) {
        console.error('Error when download csv data', setting, err);
        reject({ err: err, setting: setting });
      }

      // Do not use request like that:
      // request(setting.download, function (err, res, body) {...
      // it will cause an encoding problem, see decribtion below:
      // https://github.com/ashtuchkin/iconv-lite/wiki/Use-Buffers-when-decoding
      /*
      request({
        url: setting.download,
        encoding: null
      }, function (err, res, body) {
        if (!err && res.statusCode === 200) _runCSV(iconv.decode(body, setting.encoding));
        else console.error('Error when download csv data', setting);
      });
      */
    }

    function _runCSV(csvRaw) {
      let csvString = (setting.before) ? setting.before(csvRaw) : csvRaw;
      //! Here is where papaparse execute
      csvParser.parse(csvString, config_papaparse);
    }
  });
}

/**
 * * If data is downloaded from URL(config.download was specified),
 * because we can't determine if it is json or csv from the URL string,
 * the parameter 'type' should be specified
 * ! type should be assigned when specify config.download
 * @param {string} type - 'json' || 'csv'
 * 
 * config could be an array of object to accept dealing with a series of files
 * @param {Array<object>|Object} config              - [config, config, ...]
 * Executing process：
 * Ⅰ.1判斷資料來源為網路或本機
 * 		@param {string}  config.download               - 自網路下載資料
 * 		@param {string}  config.file                   - 自本機下載資料
 * Ⅰ.2判斷資料格式 → 呼叫parseCSV || loadJSON
 *    若傳入csv字串，傳入csvParser(papaparse)解析；若傳入json格式，進入格式化程序
 * 		@param {string}  config.csvString              - 如果傳入csv，直接解析
 * 		@param {string}  config.json                   - 如果傳入json，直接讀取資料
 * 
 * Ⅱ.資料傳入_complete處理
 * Ⅱ.1 _filter指定欄位屬性，剔除不符合的列
 * Ⅱ.2 _formatData對資料格式化，傳入format物件設定
 * 		@param {array}   config.format.keep            - 剔除不保留的屬性 TODO:考慮加入正規表達式比對
 * 		@param {boolean} config.format.allowSpace      - 移除空白字元
 * 		@param {array}   config.format.comma2Array     - 將屬性由含','的字串分割為array
 * 		@param {array}   config.format.semicolon2Array - 將屬性由含';'的字串分割為array
 * 		@param {array}   config.format.toBool          - 轉換屬性為布林值（容許傳入array）
 * 		@param {array}   config.format.toInt           - 轉換字串為整數，如果設定allowNull則屬性可為null值
 * 		@param {array}   config.format.toFloat         - 轉換字串為浮點數，如果設定allowNull則屬性可為null值
 * 
 * Ⅲ.執行使用者自訂的資料處理函式success
 *    @param {function} config.before                - 在csv字串解析前，對raw string做處理，最後需回傳csvString
 * 		@param {function} config.success
 * 
 * Ⅳ.回覆處理結果
 * 		@param {string}  config.eventName			         - 廣播事件名稱
 */
function main(config, eeNode, /*optional*/type) {
  eeNode_cache = eeNode;

  //! Notice: The only use of i is to broadcast it
  if (Array.isArray(config)) return config.forEach((setting, i) => execute(setting, i));
  else return execute(config);

  function execute(config, /*optional*/index) {
    let promise;
    if (!config.hasOwnProperty) return console.log('Error setting in csv2json', config);

    // When data had been prepared
    // DEBUG: config.csvString.length == 0 for empty string
    if (config.csvString || config.csvString?.length == 0) return parseCSV(config, index);
    else if (config.json) return loadJSON(config, index);

    // When data needs to be loaded or downloaded
    if (config.file) return (isJsonFile(config.file)) ? loadJSON(config, index) : parseCSV(config, index);
    else if (config.download) {
      if (!type || typeof type !== 'string') return console.warn('csv2json Error | Need to specify type "json" or "csv"', config);

      promise = (type.toLowerCase() === 'csv') ? parseCSV(config, index) : loadJSON(config, index);
      // TODO: 改為需指定錯誤事件名稱，或直接拋出錯誤→不然根本不知道要接收'csv2json:error'，等用到再開發此功能
      promise.catch(err => { eeNode.emit('csv2json:error', err); });
      return promise; // TODO: 未測試
    }

    console.warn('csv2json | config did not be catched', config);
  }
}

module.exports = main;