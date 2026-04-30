'use strict';

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { describe, it } = require('node:test');

const bookDir = path.resolve('test','.bookmarks');
const book    = require('../lib/bookmark')(bookDir);

describe('bookmark', function () {

  const testFile = path.resolve('./test', 'data', 'test.log');

  it('creates missing bookmark dir', function (_t, done) {

    const missingDir = path.resolve('test', 'missing-dir');
    const book = require('../lib/bookmark')(missingDir);
    book.createDir(() => {
      fs.stat(missingDir, (err, stat) => {
        assert.ifError(err);
        assert.ok(stat.isDirectory());
        fs.rmdir(missingDir, done);
      })
    })
  })

  it('saves a bookmark', function (_t, done) {
    book.save({ file: testFile, lines: 45 }, (err) => {
      assert.ifError(err);
      done();
    })
  })

  it('reads a bookmark', function (_t, done) {
    book.read(testFile, (err, mark) => {
      assert.ifError(err);
      assert.equal(mark.lines, 45);
      done();
    })
  })

  it('errors on unwritable bookmark dir', function (_t, done) {

    const noPermDir = path.resolve('test', 'data', 'nowrite', 'newdir-' + Date.now());
    const book = require('../lib/bookmark')(noPermDir);
    book.createDir(() => {
      fs.stat(noPermDir, (err, stat) => {
        assert.ok(err, 'should error when creating dir in nowrite dir');
        done();
      })
    })
  })

  it('errs on unreadable bookmark', function (_t, done) {
    const noReadDir = path.resolve('test', 'data', 'noread');
    const book = require('../lib/bookmark')(noReadDir);
    book.read(path.resolve(noReadDir, 'file'), (err, mark) => {
      assert.ok(err);
      done();
    })
  })
})

describe('error handling', function () {

  const testFile = path.resolve('./test', 'data', 'write-error.log');

  it('save emits debugging on stat error', { timeout: 4000 }, function (_t, done) {
    process.env.MOCK_STAT_ERROR=true;
    book.save({ file: testFile, lines: 45 }, (err) => {
      process.env.MOCK_STAT_ERROR=false;
      assert.ok(err);
      done();
    })
  })
})
