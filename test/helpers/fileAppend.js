var assert  = require('assert');
var fs      = require('fs');

var filePath = process.env.FILE_PATH;
var newLine  = process.env.LOG_LINE || 'you forget to set LOG_LINE\n';

fs.appendFile(filePath, newLine, function (err) {
    assert.ifError(err);
    process.send('fileAppend -> fs.appendFile: ' + filePath);
});
