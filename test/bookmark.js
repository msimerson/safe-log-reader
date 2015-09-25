'use strict';

var assert  = require('assert');
var fs      = require('fs');
var path    = require('path');

var bookDir = path.resolve('test','.bookmarks');
var book    = require('../lib/bookmark')(bookDir);

describe('bookmark', function () {

  var testFile = path.resolve('./test', 'data', 'test.log');

  it('creates missing bookmark dir', function (done) {

    var missingDir = path.resolve('test', 'missing-dir');
    var book = require('../lib/bookmark')(missingDir);
    book.createDir(function () {
      fs.stat(missingDir, function (err, stat) {
        assert.ifError(err);
        assert.ok(stat.isDirectory());
        fs.rmdir(missingDir, done);
      });
    });
  });

  it('saves a bookmark', function (done) {
    book.save(testFile, 45, function (err) {
      assert.ifError(err);
      done();
    });
  });

  it('reads a bookmark', function (done) {
    book.read(testFile, function (err, mark) {
      assert.ifError(err);
      assert.equal(mark.lines, 45);
      done();
    });
  });

  it('errors on unwritable bookmark dir', function (done) {

    var noPermDir = path.resolve('test', 'data.nowrite', 'any');
    var book = require('../lib/bookmark')(noPermDir);
    book.createDir(function () {
      fs.stat(noPermDir, function (err, stat) {
        assert.ok(err);
        done();
      });
    });
  });

  it('errs on unreadable bookmark', function (done) {
    var noReadDir = path.resolve('test', 'data', 'noread');
    var book = require('../lib/bookmark')(noReadDir);
    // console.log(book);
    book.read(path.resolve(noReadDir, 'file'), function (err, mark) {
      assert.ok(err);
      done();
    });
  });
});
