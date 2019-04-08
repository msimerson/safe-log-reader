'use strict';

const assert  = require('assert');
const fs      = require('fs');

const filePath = process.env.FILE_PATH;
const newLine  = process.env.LOG_LINE || 'you forget to set LOG_LINE\n';

fs.appendFile(filePath, newLine, (err) => {
  assert.ifError(err);
  process.send(`fileAppend -> fs.appendFile: ${filePath}`);
})
