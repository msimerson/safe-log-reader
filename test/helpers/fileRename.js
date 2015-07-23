var assert  = require('assert');
var fs      = require('fs');
var path    = require('path');

var tmpDir  = path.resolve('test', 'tmp');
var oldPath = process.env.OLD_PATH || path.resolve(tmpDir, 'old');
var newPath = process.env.NEW_PATH || path.resolve(tmpDir, 'new');

fs.rename(oldPath, newPath, function (err) {
    assert.ifError(err);
    process.send('fileRename -> fs.rename: \n\t' +
        oldPath + ' -> \n\t' + newPath);
});
