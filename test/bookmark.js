'use strict';

const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');

const bookDir = path.resolve('test','.bookmarks');
const book    = require('../lib/bookmark')(bookDir);

describe('bookmark', function () {

  const testFile = path.resolve('./test', 'data', 'test.log');

  it('creates missing bookmark dir', function (done) {

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

  it('saves a bookmark', function (done) {
    book.save({ file: testFile, lines: 45 }, (err) => {
      assert.ifError(err);
      done();
    })
  })

  it('reads a bookmark', function (done) {
    book.read(testFile, (err, mark) => {
      assert.ifError(err);
      assert.equal(mark.lines, 45);
      done();
    })
  })

  it('errors on unwritable bookmark dir', function (done) {

    const noPermDir = path.resolve('test', 'data.nowrite', 'any');
    const book = require('../lib/bookmark')(noPermDir);
    book.createDir(() => {
      fs.stat(noPermDir, (err, stat) => {
        assert.ok(err);
        done();
      })
    })
  })

  it('errs on unreadable bookmark', function (done) {
    const noReadDir = path.resolve('test', 'data', 'noread');
    const book = require('../lib/bookmark')(noReadDir);
    // console.log(book);
    book.read(path.resolve(noReadDir, 'file'), (err, mark) => {
      assert.ok(err);
      done();
    })
  })
})

describe('error handling', function () {

  const testFile = path.resolve('./test', 'data', 'write-error.log');

  it('save emits debugging on stat error', function (done) {
    this.timeout(4000);
    process.env.MOCK_STAT_ERROR=true;
    book.save({ file: testFile, lines: 45 }, (err) => {
      process.env.MOCK_STAT_ERROR=false;
      assert.ok(err);
      done();
    })
  })
})
