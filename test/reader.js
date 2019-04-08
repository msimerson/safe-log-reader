'use strict';

const assert  = require('assert');
const child   = require('child_process');
const fs      = require('fs');
const path    = require('path');
const EOL     = require('os').EOL;

const readerOpts = {
  bookmark: { dir: path.resolve('test', '.bookmarks') },
  batchLimit: 1024,
}

const noBmReadOpts = JSON.parse(JSON.stringify(readerOpts));
noBmReadOpts.noBookmark = true;

const reader  = require('../index');

const dataDir = path.join('test', 'data');
const logLine = 'The rain in spain falls mainly on the plain.';

function newFile (filePath, data, done) {
  // unlink first, b/c fs.writeFile overwrite doesn't replace the inode
  fs.unlink(filePath, (err) => {
    fs.writeFile(filePath, data, done);
  })
}

before(function (done) {
  try {
    fs.unlinkSync(path.join('test','data','missing.log'));
  }
  catch (ignore) { process.stdout.write(''); }
  done();
})

describe('reader', function () {

  it('reads a text file', function (done) {
    const filePath = path.join(dataDir, 'test.log');

    // console.log(arguments);
    const r = reader.createReader(filePath, noBmReadOpts).on('read', (data) => {
        assert.equal(data, logLine);
        setTimeout(() => { r.watchStop(filePath); }, 500);
        done();
      })
  })

  it('reads another text file concurrently', function (done) {
    let linesSeen = 0;
    const filePath = path.join(dataDir, 'test.log.1');

    // the file has 3 identical log lines, we should see 3 read events emitted
    const r = reader.createReader(filePath, noBmReadOpts).on('read', (data, lines, bytes) => {
        linesSeen++;
        assert.equal(data, logLine);
        if (linesSeen === 3) {
          setTimeout(() => { r.watchStop(filePath); }, 500);
          done();
        }
      })
  })

  it('reads batches of lines', function (done) {
    let linesSeen = 0;
    const filePath = path.join(dataDir, 'batch.log');
    const batchOpts = JSON.parse(JSON.stringify(readerOpts));
    batchOpts.batchLimit = 2;
    batchOpts.noBookmark = true;

    const r = reader.createReader(filePath, batchOpts).on('read', (data, lines, bytes) => {
        linesSeen++;
        assert.equal(data, logLine);
        if (linesSeen === 9) {
          setTimeout(() => { r.watchStop(filePath); }, 500);
          done();
        }
      })
      .on('drain', (done) => { done(null, 0); });
  })

  it('maintains an accurate line counter', function (done) {
    let linesSeen = 0;
    const filePath = path.join(dataDir, 'test.log.1');

    const r = reader.createReader(filePath, noBmReadOpts).on('read', (data, lines, bytes) => {
        linesSeen++;
        assert.equal(lines, linesSeen);
        if (linesSeen === 3) {
          setTimeout(() => { r.watchStop(filePath); }, 500);
          done();
        }
      })
  })

  it('reads a gzipped file', function (done) {
    const r = reader.createReader(path.join(dataDir, 'test.log.1.gz'), noBmReadOpts)
      .on('read', function (data) {
        // console.log(data);
        assert.equal(data, logLine);
        setTimeout(() => { r.watchStop(dataDir); }, 500);
        done();
      })
  })

  it.skip('reads a bzip2 compressed file', function (done) {
    reader.createReader(path.join(dataDir, 'test.log.1.bz2'), noBmReadOpts)
      .on('read', (data) => {
        // console.log(data);
        assert.equal(data, logLine);
        done();
      })
  })

  it('emits a drain when batch is full', function (done) {
    const filePath = path.join(dataDir, 'test.log');

    const r = reader.createReader(filePath, noBmReadOpts)
      .on('testSetup', (cb) => {
        if (!this.batch) this.batch = {};
        this.batch.limit = 5;
        this.batch.count = 5;  // skip to batchLimit
        if (cb) cb()
      })
      .on('read', (data) => { assert.equal(data, logLine); })
      .on('drain', (cb)  => {
        cb(); done();
        setTimeout(() => { r.watchStop(filePath); }, 500);
      })
  })

  context('growing file', function () {
    const appendFile = path.join(dataDir, 'append.log');

    before(function (done) {
      fs.appendFile(appendFile, 'I will grow\n', (err) => {
        if (err) console.error(err);
        // console.log('\tgrowing file before append');
        done(err);
      })
    })

    this.timeout(3000);
    it('reads exactly 1 line appended after EOF', function (done) {
      let appendsRead = 0;
      let appendCalled = false;
      let appendDone = false;
      let calledDone = false;

      function tryDone () {
        if (!appendDone) {
          setTimeout(() => { tryDone(); }, 10);
          return;
        }
        if (calledDone) return;
        calledDone = true;
        assert.equal(appendsRead, 1);
        setTimeout(() => { r.watchStop(appendFile); }, 500);
        done();
      }

      const r = reader.createReader(appendFile, readerOpts)
        .on('read', function (data, linesRead) {
          // console.log('line: ' + linesRead + ', ' + data);
          if (appendDone) {
            appendsRead++;
            tryDone();
          }
        })
        .on('end', () => {

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
            })
        })
    })
  })

  context('after file rotation', function () {

    before(function (done) {
      // if (process.platform === 'win32') this.skip();
      done()
    })

    this.timeout(3000);
    it('reads lines appended to new file rotate.log', function (done) {
      let renameCalled = false;

      const rotateLog = path.join(dataDir, 'rotate.log');
      let appendDone = false;

      function doAppend () {
        child.fork(
          path.join('test','helpers','fileAppend.js'),
          {
            env: {
              FILE_PATH: rotateLog,
              LOG_LINE: logLine + '\n',
            }
          })
          .on('message', (msg) => {
            // console.log(msg);
            appendDone = true;
          });
      }

      let r;

      function tryDone () {
        if (appendDone) {
          setTimeout(() => { r.watchStop(rotateLog); }, 500);
          return done();
        }
        setTimeout(() => { tryDone(); }, 10);
      }

      newFile(rotateLog, `${logLine}\n`, () => {

        r = reader.createReader(rotateLog, readerOpts).on('read', (data, lineCount) => {
            // logger.debug(lineCount + '. ' + data);

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
              .on('message', (msg) => {
                // console.log(msg);
                doAppend();
              });
          })
          .on('end', function () {
            setTimeout(() => { r.watchStop(rotateLog); }, 500);
            // console.log('end');
          })
      })
    })

    it.skip('reads lines appended to rotated file', function (done) {
      let isRotated = false;
      let appendsSeen = 0;
      const rotateLog = path.join(dataDir, 'rotate-old.log');

      fs.writeFile(rotateLog, `${logLine}\n`, () => {

        reader.createReader(rotateLog, noBmReadOpts)
          .on('read', function (data, lineCount) {
            // console.log(lineCount + '. ' + data);

            function tryDone () {
              if (appendsSeen) return done();
              setTimeout(function () { tryDone(); }, 10);
            }

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
              .on('message', (msg) => {
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
                  })
              })
          })
      })
    })
  })

  context('on non-existent file', function () {

    const missingFile = path.resolve(dataDir, 'missing.log');
    const irrelevantFile = path.resolve(dataDir, 'irrelevant.log');

    const childOpts  = { env: {
      FILE_PATH: missingFile,
      LOG_LINE: (logLine + '\n'),
    } };

    before(function (done) {
      fs.unlink(missingFile, (err) => {
        // might not exist, ignore err
        done();
      })
    })

    it('ignores irrelevant files', function (done) {

      let appendDone = false;
      function tryDone () {
        if (appendDone) {
          setTimeout(() => { r.watchStop(missingFile); }, 500);
          return done();
        }
        setTimeout(() => { tryDone(); }, 10);
      }

      const r = reader.createReader(missingFile, noBmReadOpts).on('irrelevantFile', (filename) => {
          // console.log('irrelevantFile: ' + filename);
          assert.equal(filename, path.basename(irrelevantFile));
          tryDone();
        })

      process.nextTick(() => {
        child.fork(
          path.join('test','helpers','fileAppend.js'),
          {
            env: {
              FILE_PATH: irrelevantFile,
              LOG_LINE: (logLine + '\n'),
            }
          })
          .on('message', (msg) => {
            appendDone = true;
            setTimeout(() => { r.watchStop(irrelevantFile); }, 500);
            // console.log('fileAppend message: ' + msg);
          })
      })
    })

    it('discovers and reads', function (done) {

      before(function (done) {
        if (process.platform === 'win32') this.skip();
        done()
      })

      let appendDone = false;
      function tryDone () {
        if (appendDone) {
          setTimeout(() => { r.watchStop(missingFile); }, 500);
          return done();
        }
        setTimeout(() => { tryDone(); }, 10);
      }

      const r = reader.createReader(missingFile, noBmReadOpts)
        .on('read', (data) => {
          assert.equal(data, logLine);
          tryDone();
        })
        .on('error', (err) => {
          console.error('error: ' + err);
        })
        .on('end', () => {
          setTimeout(() => { r.watchStop(missingFile); }, 500);
        })

      process.nextTick(() => {
        child.fork(
          path.join('test','helpers','fileAppend.js'),
          childOpts
        )
          .on('message', (msg) => {
            appendDone = true;
            // console.log('fileAppend message: ' + msg);
          })
      })
    })

    after(function (done) {
      fs.truncate(irrelevantFile, (err) => {
        done();
      })
    })
  })

  describe('unreadable file', function () {
    it('reads nothing', function (done) {
      const filePath = path.join(dataDir, 'test-no-perm.log');

      setTimeout(() => { done(); }, 100);
      setTimeout(() => { r.watchStop(filePath); }, 500);

      const r = reader.createReader(filePath, readerOpts)
        .on('readable', () => { assert.ok(false); })
        .on('read', (data) => { assert.equal(data, false); })
    })

    it('does not watch', function (done) {
      const filePath = path.join(dataDir, 'test-no-perm.log');

      const r = reader.createReader(filePath, readerOpts)
        .on('readable', () => { assert.ok(false); })
        .on('read', (data) => { assert.equal(data, false); });

      process.nextTick(function () {
        assert.equal(r.watcher, undefined);

        setTimeout(() => { done(); }, 100);
        setTimeout(() => { r.watchStop(filePath); }, 500);
      })
    })
  })

  describe('on a file previously read', function () {

    it('skips lines confirmed as saved', function (done) {

      const Bookmark = require('../lib/bookmark');
      const bookmark = new Bookmark(readerOpts.bookmark.dir);

      const data = [];
      for (let i = 0; i < 10; i++) {
        data.push(`Line number ${i}`);
      }
      const filePath = path.join(dataDir, 'previous.log');
      fs.writeFile(filePath, data.join('\n'), (err) => {
        if (err) return done(err);
        fs.stat(filePath, (err, stat) => {
          if (err) return done(err);
          bookmark.save({ file: filePath, lines: 10 }, (err) => {
            if (err) return done(err);
            fs.appendFile(filePath, '\n' + data.join('\n'), (err) => {
              if (err) return done(err);
              let readLines = 0;
              const r = reader.createReader(filePath, readerOpts)
                .on('read', function (data) {
                  readLines++;
                  // console.log(data);
                })
                .on('drain', (cb) => {
                  cb();
                })
                .on('end', () => {
                  assert.equal(readLines, 10);
                  setTimeout(() => { r.watchStop(filePath); }, 500);
                  done();
                })
            })
          })
        })
      })
    })
  })

  describe('on a file previously read using bytes', function () {
    it('skips bytes confirmed as saved', function (done) {

      const Bookmark = require('../lib/bookmark');
      const bookmark = new Bookmark(readerOpts.bookmark.dir);

      const data = [];
      for (let i = 0; i < 10; i++) {
        data.push('Line number ' + i);
      }
      const filePath = path.join(dataDir, 'bytes.log');
      fs.writeFile(filePath, data.join('\n'), (err) => {
        if (err) return done(err);
        fs.stat(filePath, (err, stat) => {
          if (err) return done(err);
          // bytes is size of file + EOL
          bookmark.save({ file: filePath, lines: 10, bytes: stat.size + EOL.length }, (err) => {
            fs.appendFile(filePath, '\n' + data.join('\n'), (err) => {
              if (err) return done(err);
              let readLines = 0;
              const r = reader.createReader(filePath, readerOpts)
                .on('read', (data) => {
                  readLines++;
                  // console.log(data);
                })
                .on('drain', (cb) => {
                  // console.log('drain');
                  cb();
                })
                .on('end', () => {
                  // console.log('end');
                  // console.log(reader.watcher);
                  assert.equal(readLines, 10);
                  setTimeout(() => { r.watchStop(filePath); }, 1000);
                  done();
                })
              // required otherwise bytes wont be used
              r.canUseBookmarkBytes = true;
              r.linesAtEndOfFile = 10;
            })
          })
        })
      })
    })
  })

  context('reads lines appended to empty file', function () {
    this.timeout(3000);

    it('reads lines appended to empty file with empty bookmark', function (done) {

      const emptyLog = path.join(dataDir, 'empty_nobm.log');
      let appendDone = false;
      let readLines = 0;
      let r;

      function tryDone () {
        if (appendDone) {
          setTimeout(() => { r.watchStop(emptyLog); }, 500);
          return done();
        }
        setTimeout(function () {
          tryDone();
        }, 10);
      }

      newFile(emptyLog, '', function () {
        fs.stat(emptyLog, function (err, stat) {
          if (err) return done(err);

          fs.unlink(path.join(readerOpts.bookmark.dir, stat.ino.toString()), () => {
            r = reader.createReader(emptyLog, readerOpts)
              .on('read', function (data, lineCount) {
                // console.log(lineCount + '. ' + data);
                if (appendDone && ++readLines == 2) tryDone();
              })
              .on('drain', (next) => { next(); })
              .on('end', () => {
                if (appendDone === false) {
                  child.fork(path.join('test', 'helpers', 'fileAppend.js'), {
                    env: {
                      FILE_PATH: emptyLog,
                      LOG_LINE: logLine + '\n' + logLine + '\n',
                    }
                  })
                  .on('message', (msg) => {
                    // console.log(msg);
                    appendDone = true;
                  })
                }
                // console.log('end');
              })
          })
        })
      })
    })

    it('reads lines appended to empty file with old bookmark', function (done) {

      const Bookmark = require('../lib/bookmark');
      const bookmark = new Bookmark(readerOpts.bookmark.dir);

      const emptyLog = path.join(dataDir, 'empty_oldbm.log');
      let appendDone = false;
      let readLines = 0;
      let r;

      function tryDone () {
        if (appendDone) {
          setTimeout(() => { r.watchStop(emptyLog); }, 500);
          return done();
        }
        setTimeout(() => { tryDone(); }, 10);
      }

      newFile(emptyLog, '', function () {
        fs.stat(emptyLog, function (err, stat) {
          if (err) return done(err);

          bookmark.save({ file: emptyLog, lines: 12087, bytes: 4242424242 }, function (err) {
            r = reader.createReader(emptyLog, readerOpts)
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
                  })
                }
                // console.log('end');
              })
          })
        })
      })
    })
  })
})
