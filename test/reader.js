'use strict';

var assert  = require('assert');
var child   = require('child_process');
var fs      = require('fs');
var path    = require('path');
var EOL       = require('os').EOL;

var readerOpts = {
  bookmark: { dir: path.resolve('test', '.bookmarks') },
  batchLimit: 1024,
};
var noBmReadOpts = JSON.parse(JSON.stringify(readerOpts));
noBmReadOpts.noBookmark = true;

var reader  = require('../index');

var dataDir = path.join('test', 'data');
var logLine = 'The rain in spain falls mainly on the plain.';

var newFile = function (filePath, data, done) {
  // unlink first, b/c fs.writeFile overwrite doesn't replace the inode
  fs.unlink(filePath, function (err) {
    fs.writeFile(filePath, data, done);
  });
};

describe('reader', function () {

  it('reads a text file', function (done) {
    var filePath = path.join(dataDir, 'test.log');

    // console.log(arguments);
    reader.createReader(filePath, noBmReadOpts)
      .on('readable', function () { this.readLine(); })
      .on('read', function (data) {
        assert.equal(data, logLine);
        done();
      });
  });

  it('reads another text file concurrently', function (done) {
    var linesSeen = 0;
    var filePath = path.join(dataDir, 'test.log.1');

    reader.createReader(filePath, noBmReadOpts)
      .on('read', function (data, lines, bytes) {
        linesSeen++;
        assert.equal(data, logLine);
        if (linesSeen === 3) done();
      });
  });

  it('reads batches of lines', function (done) {
    var linesSeen = 0;
    var filePath = path.join(dataDir, 'batch.log');
    var batchOpts = JSON.parse(JSON.stringify(readerOpts));
    batchOpts.batchLimit = 2;
    batchOpts.noBookmark = true;

    reader.createReader(filePath, batchOpts)
      .on('read', function (data, lines, bytes) {
        linesSeen++;
        assert.equal(data, logLine);
        if (linesSeen === 9) done();
      })
      .on('drain', function (done) {
        done(null, 0);
      });
  });

  it('maintains an accurate line counter', function (done) {
    var linesSeen = 0;
    var filePath = path.join(dataDir, 'test.log.1');

    reader.createReader(filePath, noBmReadOpts)
      .on('read', function (data, lines, bytes) {
        linesSeen++;
        assert.equal(lines, linesSeen);
        if (linesSeen === 3) done();
      });
  });

  it('reads a gzipped file', function (done) {
    reader.createReader(path.join(dataDir, 'test.log.1.gz'), noBmReadOpts)
      .on('read', function (data) {
        // console.log(data);
        assert.equal(data, logLine);
        done();
      });
  });

  it.skip('reads a bzip2 compressed file', function (done) {
    reader.createReader(path.join(dataDir, 'test.log.1.bz2'), noBmReadOpts)
      .on('read', function (data) {
        // console.log(data);
        assert.equal(data, logLine);
        done();
      });
  });

  context('growing file', function () {
    var appendFile = path.join(dataDir, 'append.log');

    before(function (done) {
      fs.appendFile(appendFile, 'I will grow\n', function (err) {
        if (err) console.error(err);
        // console.log('\tgrowing file before append');
        done(err);
      });
    });

    this.timeout(3000);
    it('reads exactly 1 line appended after EOF', function (done) {
      var appendsRead = 0;
      var appendCalled = false;
      var appendDone = false;
      var calledDone = false;

      var tryDone = function () {
        if (!appendDone) {
          setTimeout(function () { tryDone(); }, 10);
          return;
        }
        if (calledDone) return;
        calledDone = true;
        assert.equal(appendsRead, 1);
        done();
      };

      reader.createReader(appendFile, readerOpts)
        .on('read', function (data, linesRead) {
          // console.log('line: ' + linesRead + ', ' + data);
          if (appendDone) {
            appendsRead++;
            tryDone();
          }
        })
        .on('end', function () {

          if (appendCalled) return;
          appendCalled = true;

          // append in a separate process, so this one gets the event
          child.fork(
            path.join('test','helpers','fileAppend.js'),
            {
              env: {
                FILE_PATH: appendFile,
                LOG_LINE: (logLine + '\n'),
              }
            })
            .on('message', function (msg) {
              // console.log(msg);
              appendDone = true;
            });
        });
    });
  });

  context('after file rotation', function () {

    this.timeout(3000);
    it('reads lines appended to new file rotate.log', function (done) {
      var renameCalled = false;

      var rotateLog = path.join(dataDir, 'rotate.log');
      var appendDone = false;

      var doAppend = function () {
        child.fork(
          path.join('test','helpers','fileAppend.js'),
          {
            env: {
              FILE_PATH: rotateLog,
              LOG_LINE: logLine + '\n',
            }
          })
          .on('message', function (msg) {
            // console.log(msg);
            appendDone = true;
          });
      };

      var tryDone = function () {
        if (appendDone) return done();
        setTimeout(function () { tryDone(); }, 10);
      };

      newFile(rotateLog, logLine + '\n', function () {

        reader.createReader(rotateLog, readerOpts)
          .on('read', function (data, lineCount) {
            // console.log(lineCount + '. ' + data);

            if (appendDone) tryDone();
            if (renameCalled) return;
            renameCalled = true;

            child.fork(
              path.join('test','helpers','fileRename.js'),
              {
                env: {
                  OLD_PATH: rotateLog,
                  NEW_PATH: rotateLog + '.1',
                }
              })
              .on('message', function (msg) {
                // console.log(msg);
                doAppend();
              });
          })
          .on('end', function () {
          // console.log('end');
          });
      });
    });

    it.skip('reads lines appended to rotated file', function (done) {
      var isRotated = false;
      var appendsSeen = 0;
      var rotateLog = path.join(dataDir, 'rotate-old.log');

      fs.writeFile(rotateLog, logLine + '\n', function () {

        reader.createReader(rotateLog, noBmReadOpts)
          .on('read', function (data, lineCount) {
            // console.log(lineCount + '. ' + data);

            var tryDone = function () {
              if (appendsSeen) return done();
              setTimeout(function () { tryDone(); }, 10);
            };

            if (lineCount === 2) tryDone();
            if (isRotated) return;

            child.fork(
              path.join('test','helpers','fileRename.js'),
              {
                env: {
                  OLD_PATH: rotateLog,
                  NEW_PATH: rotateLog + '.1',
                }
              })
              .on('message', function (msg) {
                // console.log(msg);
                isRotated = true;
                child.fork(
                  path.join('test','helpers','fileAppend.js'),
                  {
                    env: {
                      FILE_PATH: rotateLog + '.1',
                      LOG_LINE: logLine + '\n',
                    }
                  })
                  .on('message', function (msg) {
                    // console.log(msg);
                    appendsSeen++;
                  });
              });
          });
      });
    });
  });

  context('on non-existent file', function () {

    var missingFile = path.resolve(dataDir, 'missing.log');
    var irrelevantFile = path.resolve(dataDir, 'irrelevant.log');

    var childOpts  = { env: {
      FILE_PATH: missingFile,
      LOG_LINE: (logLine + '\n'),
    } };

    before(function (done) {
      fs.unlink(missingFile, function (err) {
        // might not exist, ignore err
        done();
      });
    });

    it('ignores irrelevant files', function (done) {

      var appendDone = false;
      var tryDone = function () {
        if (appendDone) return done();
        setTimeout(function () { tryDone(); }, 10);
      };

      reader.createReader(missingFile, noBmReadOpts)
        .on('irrelevantFile', function (filename) {
          // console.log('irrelevantFile: ' + filename);
          assert.equal(filename, path.basename(irrelevantFile));
          tryDone();
        });

      process.nextTick(function () {
        child.fork(
          path.join('test','helpers','fileAppend.js'),
          {
            env: {
              FILE_PATH: irrelevantFile,
              LOG_LINE: (logLine + '\n'),
            }
          })
          .on('message', function (msg) {
            appendDone = true;
            // console.log('fileAppend message: ' + msg);
          });
      });
    });

    it('discovers and reads', function (done) {

      var appendDone = false;
      var tryDone = function () {
        if (appendDone) return done();
        setTimeout(function () { tryDone(); }, 10);
      };

      reader.createReader(missingFile, noBmReadOpts)
        .on('read', function (data) {
          assert.equal(data, logLine);
          tryDone();
        })
        .on('error', function (err) {
          console.error('error: ' + err);
        });

      process.nextTick(function () {
        child.fork(
          path.join('test','helpers','fileAppend.js'),
          childOpts
        )
          .on('message', function (msg) {
            appendDone = true;
            // console.log('fileAppend message: ' + msg);
          });
      });
    });

    after(function (done) {
      fs.truncate(irrelevantFile, function (err) {
        done();
      });
    });

  });

  describe('unreadable file', function () {
    it('reads nothing', function (done) {
      var filePath = path.join(dataDir, 'test-no-perm.log');

      setTimeout(function () {
        done();
      }, 100);

      reader.createReader(filePath, readerOpts)
        .on('readable', function () { assert.ok(false); })
        .on('read', function (data) {
          assert.equal(data, false);
        });
    });

    it('does not watch', function (done) {
      var filePath = path.join(dataDir, 'test-no-perm.log');

      var r = reader.createReader(filePath, readerOpts)
        .on('readable', function () { assert.ok(false); })
        .on('read', function (data) {
          assert.equal(data, false);
        });

      process.nextTick(function () {
        assert.equal(r.watcher, undefined);
        r.watcher = true;
        r.endStream();
        // console.log(r);

        process.nextTick(function () {
          setTimeout(function () {
            done();
          }, 100);
        });
      });
    });
  });

  it('emits a drain when batch is full', function (done) {
    var filePath = path.join(dataDir, 'test.log');

    var r = reader.createReader(filePath, noBmReadOpts)
      .on('testSetup', function () {
        r.filePath = './non-existent';
        this.batch.limit = 5;
        this.batch.count = 5;  // skip to batchLimit
      })
      .on('read', function (data) {
        assert.equal(data, undefined);
      })
      .on('drain', function (cb) {
        cb();
        done();
      });
  });

  describe('on a file previously read', function () {
    it('skips lines confirmed as saved', function (done) {

      var Bookmark = require('../lib/bookmark');
      var bookmark = new Bookmark(readerOpts.bookmark.dir);

      var data = [];
      for (var i = 0; i < 10; i++) {
        data.push('Line number ' + i);
      }
      var filePath = path.join(dataDir, 'previous.log');
      fs.writeFile(filePath, data.join('\n'), function (err) {
        if (err) return done(err);
        fs.stat(filePath, function (err, stat) {
          if (err) return done(err);
          bookmark.save({ file: filePath, lines: 10 }, function (err) {
            fs.appendFile(filePath, '\n' + data.join('\n'), function (err) {
              if (err) return done(err);
              var readLines = 0;
              reader.createReader(filePath, readerOpts)
                .on('read', function (data) {
                  readLines++;
                  // console.log(data);
                })
                .on('drain', function (cb) {
                  cb();
                })
                .on('end', function () {
                  assert.equal(readLines, 10);
                  done();
                });
            });
          });
        });
      });
    });
  });

  describe('on a file previously read using bytes', function () {
    it('skips bytes confirmed as saved', function (done) {

      var Bookmark = require('../lib/bookmark');
      var bookmark = new Bookmark(readerOpts.bookmark.dir);

      var data = [];
      for (var i = 0; i < 10; i++) {
        data.push('Line number ' + i);
      }
      var filePath = path.join(dataDir, 'bytes.log');
      fs.writeFile(filePath, data.join('\n'), function (err) {
        if (err) return done(err);
        fs.stat(filePath, function (err, stat) {
          if (err) return done(err);
          // bytes is size of file + EOL
          bookmark.save({ file: filePath, lines: 10, bytes: stat.size + EOL.length }, function (err) {
            fs.appendFile(filePath, '\n' + data.join('\n'), function (err) {
              if (err) return done(err);
              var readLines = 0;
              var r = reader.createReader(filePath, readerOpts)
                .on('read', function (data) {
                  readLines++;
                  // console.log(data);
                })
                .on('drain', function (cb) {
                  cb();
                })
                .on('end', function (cb) {
                  assert.equal(readLines, 10);
                  done();
                });
              // required otherwise bytes wont be used
              r.canUseBookmarkBytes = true;
              r.linesAtEndOfFile = 10;
            });
          });
        });
      });
    });
  });

  context('reads lines appended to empty file', function () {
    this.timeout(3000);

    it('reads lines appended to empty file with empty bookmark', function (done) {

      var emptyLog = path.join(dataDir, 'empty_nobm.log');
      var appendDone = false;
      var readLines = 0;

      var tryDone = function () {
        if (appendDone) return done();
        setTimeout(function () {
          tryDone();
        }, 10);
      };

      newFile(emptyLog, '', function () {
        fs.stat(emptyLog, function (err, stat) {
          if (err) return done(err);

          fs.unlink(path.join(readerOpts.bookmark.dir, stat.ino.toString()), function () {
            reader.createReader(emptyLog, readerOpts)
              .on('read', function (data, lineCount) {
                // console.log(lineCount + '. ' + data);
                if (appendDone && ++readLines == 2) tryDone();
              })
              .on('drain', function(next){
                next();
              })
              .on('end', function () {
                if (appendDone === false) {
                  child.fork(path.join('test', 'helpers', 'fileAppend.js'), {
                    env: {
                      FILE_PATH: emptyLog,
                      LOG_LINE: logLine + '\n' + logLine + '\n',
                    }
                  })
                  .on('message', function (msg) {
                    // console.log(msg);
                    appendDone = true;
                  });
                }
                // console.log('end');
              });
          });
        });
      });
    });

    it('reads lines appended to empty file with old bookmark', function (done) {

      var Bookmark = require('../lib/bookmark');
      var bookmark = new Bookmark(readerOpts.bookmark.dir);

      var emptyLog = path.join(dataDir, 'empty_oldbm.log');
      var appendDone = false;
      var readLines = 0;

      var tryDone = function () {
        if (appendDone) return done();
        setTimeout(function () {
          tryDone();
        }, 10);
      };

      newFile(emptyLog, '', function () {
        fs.stat(emptyLog, function (err, stat) {
          if (err) return done(err);

          bookmark.save({ file: emptyLog, lines: 12087, bytes: 4242424242 }, function (err) {
            reader.createReader(emptyLog, readerOpts)
              .on('read', function (data, lineCount) {
                // console.log(lineCount + '. ' + data);
                if (appendDone && ++readLines == 2) tryDone();
              })
              .on('drain', function(next){
                next();
              })
              .on('end', function () {
                if (appendDone === false) {
                  child.fork(path.join('test', 'helpers', 'fileAppend.js'), {
                    env: {
                      FILE_PATH: emptyLog,
                      LOG_LINE: logLine + '\n' + logLine + '\n',
                    }
                  })
                  .on('message', function (msg) {
                    // console.log(msg);
                    appendDone = true;
                  });
                }
                // console.log('end');
              });
          });
        });
      });
    });
  });
});
