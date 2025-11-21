
# csv2json

A versatile Node.js module for converting CSV and JSON data from various sources (strings, files, URLs) into a structured JSON format. It offers powerful features for data filtering, formatting, and type conversion.

## Features

- **Multiple Data Sources**: Load data from files, URLs, or in-memory strings.
- **CSV & JSON Support**: Handles both CSV and JSON input seamlessly.
- **Promise-based**: Asynchronous operations return Promises for modern async/await handling.
- **Data Transformation**:
    - Filter rows based on column values.
    - Selectively keep or discard columns.
    - Handle null values and whitespace.
    - Convert data types (integer, float, boolean).
    - Split delimited strings into arrays.
    - Pre-process raw data and post-process parsed data with custom functions.
- **Custom Hooks**: Inject custom logic before and after data processing.
- **Event-driven**: Integrates with an event emitter to broadcast completion or error events.
- **Encoding Support**: Handles different character encodings like `utf8` and `big5`.

## Quick Start
Here's a basic example of converting a CSV string to JSON.
```javascript
// main.js
import csv2json from 'csv2json';
import EventEmitter from 'eventemitter3';

const eeNode = new EventEmitter();

// Listen for the completion event
eeNode.on('csv2json:complete', (json) => {
  console.log('Conversion successful:');
  console.log(json);
});

// Listen for errors
eeNode.on('csv2json:error', (err) => {
  console.error('An error occurred:', err);
});

const csvString = `name,age,isStudent\nAlice,30,true\nBob,25,false`;

const config = {
  csvString: csvString,
  format: {
    toInt: ['age'],
    toBool: ['isStudent']
  }
};

// Start the conversion
csv2json(config, eeNode);

/*
Output:
Conversion successful:
[
  { name: 'Alice', age: 30, isStudent: true },
  { name: 'Bob', age: 25, isStudent: false }
]
*/
```
or you can load data from local files.
```javascript
const config = {
  file: './data/sample.csv',
  format: {
    toInt: ['age', 'id'],
    toBool: ['isActive']
  },
  // Event name for completion
  eventName: 'csv2jsonComplete'
};
```


## API Reference
`csv2json(config, eeNode, [type])`
This is the main function of the module.

- `config` (Object | Array\<Object\>): A configuration object or an array of them(for batch processing).
- `eeNode` (EventEmitter): An instance of an event emitter (e.g., from eventemitter3) to handle events.
- `type` (string, optional): Must be specified as 'csv' or 'json' when using the download option.


## Configuration Options
The config object is used to control the entire conversion process.

### Data Source (Choose one)
| Property      | Type     | Description                                                                 |
| :------------ | :------- | :-------------------------------------------------------------------------- |
| `csvString`   | `string` | A raw CSV string to parse.                                                  |
| `json`        | `object` | A raw JSON object or array.                                                 |
| `file`        | `string` | Path to a local `.csv` or `.json` file. The type is inferred from the extension. |
| `download`    | `string` | URL to download the data from. Requires the `type` parameter to be set.     |

### Parsing Options
| Property     | Type      | Default | Description                                                              |
| :----------- | :-------- | :------ | :----------------------------------------------------------------------- |
| `encoding`   | `string`  | `'utf8'`  | Character encoding for file reading or downloads (e.g., `'big5'`).       |
| `header`     | `boolean` | `true`    | Specifies if the first row of the CSV is the header.                     |

### Data Processing
| Property | Type       | Description                                                                                             |
| :------- | :--------- | :------------------------------------------------------------------------------------------------------ |
| `filter`   | `object`   | An object to filter rows. Example: `{ "columnName": "value" }` keeps rows where `columnName` is `value`. |
| `before`   | `function` | A function `(string) => string` to pre-process the raw data string before parsing.                      |
| `success`  | `function` | A function `(array) => array` to post-process the final array of JSON objects.                          |

### Formatting Options (config.format)
The format object specifies how to transform the data in each row.
| Property            | Type      | Description                                                                                             |
| :------------------ | :-------- | :------------------------------------------------------------------------------------------------------ |
| `keep`              | `Array`   | An array of column names to keep. All other columns will be removed.                                    |
| `allowSpace`        | `boolean` | If `false`, trims whitespace from values during filtering.                                              |
| `allowNull`         | `boolean` | If `true`, allows `null` values for numeric conversions that fail.                                        |
| `toBool`            | `Array`   | An array of column names to convert to `boolean`.                                                       |
| `toInt`             | `Array`   | An array of column names to convert to `integer`.                                                       |
| `toFloat`           | `Array`   | An array of column names to convert to `float`.                                                         |
| `toString`          | `Array`   | An array of column names to explicitly treat as strings, preserving leading zeros and whitespace.         |
| `comma2Array`       | `Array`   | An array of column names whose values should be split by a comma (`,`) into an array.                     |
| `semicolon2Array`   | `Array`   | An array of column names whose values should be split by a semicolon (`;`) into an array.                 |

### Event Options
| Property         | Type     | Default                | Description                               |
| :--------------- | :------- | :--------------------- | :---------------------------------------- |
| `eventName`      | `string` | `'csv2jsonComplete'`   | The event name emitted on success.        |
| `eventNameError` | `string` | `'csv2json:error'`     | The event name emitted on error.          |

## Advanced Examples
### Processing a Local File with Async/Await
The function returns a promise, making it easy to use with async/await.
```javascript
import csv2json from 'csv2json';
import EventEmitter from 'eventemitter3';
import path from 'path';

const eeNode = new EventEmitter();

async function processFile() {
  const config = {
    file: path.join(__dirname, 'data.csv'),
    format: {
      toFloat: ['price'],
      toInt: ['quantity']
    },
    filter: {
      category: 'Electronics'
    }
  };

  try {
    const jsonData = await csv2json(config, eeNode);
    console.log('Filtered Electronics:', jsonData);
  } catch (error) {
    console.error('Failed to process file:', error);
  }
}

processFile();
```
### Downloading and Processing Multiple Files
You can pass an array of configurations to process multiple files in sequence.
```javascript
import csv2json from 'csv2json';
import EventEmitter from 'eventemitter3';

const eeNode = new EventEmitter();

// The event listener will be triggered for each completed file.
// The `index` argument corresponds to the config's position in the array.
eeNode.on('csv2jsonComplete', (data, index) => {
  console.log(`File ${index + 1} processed successfully:`, data);
});

async function downloadAll() {
  const configs = [
    {
      download: 'https://example.com/products.csv',
      eventName: 'productsDone',
      format: { toInt: ['stock'] }
    },
    {
      download: 'https://example.com/users.json',
      eventName: 'usersDone'
    }
  ];

  try {
    // The final result is an array containing the results of each task
    const [products, users] = await csv2json(configs, eeNode, 'csv'); // 'csv' is for the first download
    console.log('All downloads complete.');
  } catch (error) {
    console.error('An error occurred during download:', error);
  }
}

downloadAll();
```
