'use strict';

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');

const tmpDir  = path.resolve('test', 'tmp');
const oldPath = process.env.OLD_PATH || path.resolve(tmpDir, 'old');
const newPath = process.env.NEW_PATH || path.resolve(tmpDir, 'new');

fs.rename(oldPath, newPath, (err) => {
  assert.ifError(err);
  process.send(`fileRename -> fs.rename: \n\t ${oldPath} -> \n\t${newPath}`);
})
