import assert from 'node:assert';
import { fork } from 'node:child_process';
import { appendFile, stat, truncate, unlink, writeFile } from 'node:fs/promises';
import { EOL } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { describe, it, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReader } from '../index.js';
import { Bookmark } from '../lib/bookmark.js';

const __dirname      = dirname(fileURLToPath(import.meta.url));
const fileAppendPath = join(__dirname, 'helpers', 'fileAppend.js');
const fileRenamePath = join(__dirname, 'helpers', 'fileRename.js');

const readerOpts = {
  bookmark: { dir: join('test', '.bookmarks') },
  batchLimit: 1024,
};

const noBmReadOpts = { ...readerOpts, noBookmark: true };

const dataDir = join('test', 'data');
const logLine = 'The rain in spain falls mainly on the plain.';

async function newFile(filePath, data) {
  try { await unlink(filePath); } catch { /* ignore - file may not exist */ }
  await writeFile(filePath, data);
}

before(async () => {
  try { await unlink(join('test', 'data', 'missing.log')); } catch { /* ignore */ }
});

describe('reader', function () {
  it('reads a text file', async () => {
    const filePath = join(dataDir, 'test.log');
    const r = createReader(filePath, noBmReadOpts);
    await new Promise(resolve => r.once('read', data => {
      assert.equal(data, logLine);
      resolve();
    }));
    r.watchStop(filePath);
  });

  it('reads another text file concurrently', async () => {
    let linesSeen = 0;
    const filePath = join(dataDir, 'test.log.1');
    const r = createReader(filePath, noBmReadOpts);
    await new Promise(resolve => r.on('read', data => {
      linesSeen++;
      assert.equal(data, logLine);
      if (linesSeen === 3) resolve();
    }));
    r.watchStop(filePath);
  });

  it('reads batches of lines', async () => {
    let linesSeen = 0;
    const filePath = join(dataDir, 'batch.log');
    const batchOpts = { ...readerOpts, batchLimit: 2, noBookmark: true };
    const r = createReader(filePath, batchOpts);
    await new Promise(resolve => {
      r.on('read', data => {
        linesSeen++;
        assert.equal(data, logLine);
        if (linesSeen === 9) resolve();
      }).on('drain', drainCb => { drainCb(null, 0); });
    });
    r.watchStop(filePath);
  });

  it('maintains an accurate line counter', async () => {
    let linesSeen = 0;
    const filePath = join(dataDir, 'test.log.1');
    const r = createReader(filePath, noBmReadOpts);
    await new Promise(resolve => r.on('read', (data, lines) => {
      linesSeen++;
      assert.equal(lines, linesSeen);
      if (linesSeen === 3) resolve();
    }));
    r.watchStop(filePath);
  });

  it('reads a gzipped file', async () => {
    const r = createReader(join(dataDir, 'test.log.1.gz'), noBmReadOpts);
    await new Promise(resolve => r.once('read', data => {
      assert.equal(data, logLine);
      resolve();
    }));
    r.watchStop(dataDir);
  });

  it.skip('reads a bzip2 compressed file', async () => {
    const r = createReader(join(dataDir, 'test.log.1.bz2'), noBmReadOpts);
    await new Promise(resolve => r.once('read', data => {
      assert.equal(data, logLine);
      resolve();
    }));
  });

  it('emits a drain when batch is full', async () => {
    const filePath = join(dataDir, 'test.log');
    const r = createReader(filePath, noBmReadOpts);
    await new Promise(resolve => {
      r.on('read', data => { assert.equal(data, logLine); })
       .on('drain', drainCb => { drainCb(); resolve(); });
    });
    r.watchStop(filePath);
  });

  describe('growing file', { timeout: 3000 }, function () {
    const appendFile_ = join(dataDir, 'append.log');

    before(async () => {
      await appendFile(appendFile_, 'I will grow\n');
    });

    it('reads exactly 1 line appended after EOF', async () => {
      let appendsRead = 0;
      let appendDone  = false;

      const r = createReader(appendFile_, readerOpts);
      await new Promise(resolve => {
        r.on('read', () => {
          if (appendDone) {
            appendsRead++;
            assert.equal(appendsRead, 1);
            r.watchStop(appendFile_);
            resolve();
          }
        })
        .on('drain', drainCb => { drainCb(); })
        .on('end', () => {
          if (appendDone) return;
          fork(fileAppendPath, {
            env: { FILE_PATH: appendFile_, LOG_LINE: logLine + '\n' },
          }).on('message', () => { appendDone = true; });
        });
      });
    });
  });

  describe('after file rotation', { timeout: 3000 }, function () {
    it('reads lines appended to new file rotate.log', async () => {
      let renameCalled = false;
      let appendDone   = false;
      const rotateLog  = join(dataDir, 'rotate.log');

      function doAppend() {
        fork(fileAppendPath, {
          env: { FILE_PATH: rotateLog, LOG_LINE: logLine + '\n' },
        }).on('message', () => { appendDone = true; });
      }

      await newFile(rotateLog, `${logLine}\n`);

      let r;
      await new Promise(resolve => {
        r = createReader(rotateLog, readerOpts)
          .on('read', () => {
            if (appendDone) {
              r.watchStop(rotateLog);
              return resolve();
            }
            if (renameCalled) return;
            renameCalled = true;
            fork(fileRenamePath, {
              env: { OLD_PATH: rotateLog, NEW_PATH: rotateLog + '.1' },
            }).on('message', () => { doAppend(); });
          })
          .on('end', () => {
            setTimeout(() => r.watchStop(rotateLog), 500);
          });
      });
      r.watchStop(rotateLog);
    });

    it.skip('reads lines appended to rotated file', async () => {
      let isRotated   = false;
      let appendsSeen = 0;
      const rotateLog = join(dataDir, 'rotate-old.log');

      await writeFile(rotateLog, `${logLine}\n`);
      const r = createReader(rotateLog, noBmReadOpts);
      await new Promise(resolve => {
        r.on('read', (data, lineCount) => {
          if (lineCount === 2 && appendsSeen) return resolve();
          if (isRotated) return;
          fork(fileRenamePath, {
            env: { OLD_PATH: rotateLog, NEW_PATH: rotateLog + '.1' },
          }).on('message', () => {
            isRotated = true;
            fork(fileAppendPath, {
              env: { FILE_PATH: rotateLog + '.1', LOG_LINE: logLine + '\n' },
            }).on('message', () => { appendsSeen++; });
          });
        });
      });
    });
  });

  describe('on non-existent file', function () {
    const missingFile    = join(dataDir, 'missing.log');
    const irrelevantFile = join(dataDir, 'irrelevant.log');

    before(async () => {
      try { await unlink(missingFile); } catch { /* might not exist */ }
    });

    it('ignores irrelevant files', async () => {
      const r = createReader(missingFile, noBmReadOpts);
      await new Promise(resolve => {
        r.on('irrelevantFile', filename => {
          assert.equal(filename, basename(irrelevantFile));
          r.watchStop(missingFile);
          resolve();
        });
        process.nextTick(() => {
          fork(fileAppendPath, {
            env: { FILE_PATH: irrelevantFile, LOG_LINE: logLine + '\n' },
          });
        });
      });
    });

    it('discovers and reads', async (t) => {
      if (process.platform === 'win32') return t.skip();

      let appendDone = false;
      let testDone   = false;

      const r = createReader(missingFile, noBmReadOpts);
      await new Promise(resolve => {
        r.on('read', data => {
          assert.equal(data, logLine);
          if (testDone) return;
          testDone = true;
          r.watchStop(missingFile);
          resolve();
        }).on('end', () => {
          r.watchStop(missingFile);
        });
        process.nextTick(() => {
          fork(fileAppendPath, {
            env: { FILE_PATH: missingFile, LOG_LINE: logLine + '\n' },
          }).on('message', () => { appendDone = true; });
        });
      });
      assert.ok(appendDone || testDone);
    });

    after(async () => {
      await truncate(irrelevantFile);
    });
  });

  describe('unreadable file', function () {
    it('reads nothing', async () => {
      const filePath = join(dataDir, 'test-no-perm.log');
      const r = createReader(filePath, readerOpts)
        .on('readable', () => { assert.ok(false); })
        .on('read', data => { assert.equal(data, false); });
      await new Promise(resolve => setTimeout(resolve, 100));
      r.watchStop(filePath);
    });

    it('does not watch', async () => {
      const filePath = join(dataDir, 'test-no-perm.log');
      const r = createReader(filePath, readerOpts)
        .on('readable', () => { assert.ok(false); })
        .on('read', data => { assert.equal(data, false); });
      await new Promise(resolve => process.nextTick(resolve));
      assert.equal(r.watcher, undefined);
      await new Promise(resolve => setTimeout(resolve, 100));
      r.watchStop(filePath);
    });
  });

  describe('on a file previously read', function () {
    it('skips lines confirmed as saved', async () => {
      const bookmark = new Bookmark(readerOpts.bookmark.dir);
      const data     = Array.from({ length: 10 }, (_, i) => `Line number ${i}`);
      const filePath = join(dataDir, 'previous.log');

      await writeFile(filePath, data.join('\n'));
      await bookmark.save({ file: filePath, lines: 10 });
      await appendFile(filePath, '\n' + data.join('\n'));

      let readLines = 0;
      const r = createReader(filePath, readerOpts);
      await new Promise(resolve => {
        r.on('read', () => { readLines++; })
         .on('drain', cb => { cb(); })
         .on('end', () => {
           assert.equal(readLines, 10);
           resolve();
         });
      });
      setTimeout(() => r.watchStop(filePath), 500);
    });
  });

  describe('on a file previously read using bytes', function () {
    it('skips bytes confirmed as saved', async () => {
      const bookmark = new Bookmark(readerOpts.bookmark.dir);
      const data     = Array.from({ length: 10 }, (_, i) => `Line number ${i}`);
      const filePath = join(dataDir, 'bytes.log');

      await writeFile(filePath, data.join('\n'));
      const fileStat = await stat(filePath);
      await bookmark.save({ file: filePath, lines: 10, bytes: fileStat.size + EOL.length });
      await appendFile(filePath, '\n' + data.join('\n'));

      let readLines = 0;
      const r = createReader(filePath, readerOpts);
      r.canUseBookmarkBytes = true;
      r.linesAtEndOfFile    = 10;

      await new Promise(resolve => {
        let done = false;
        r.on('read', () => { if (!done) readLines++; })
         .on('drain', cb => { cb(); })
         .on('end', () => {
           if (done || readLines === 0) return;
           done = true;
           assert.equal(readLines, 10);
           r.watchStop(filePath);
           resolve();
         });
      });
    });
  });

  describe('reads lines appended to empty file', { timeout: 3000 }, function () {
    it('reads lines appended to empty file with empty bookmark', async () => {
      const emptyLog   = join(dataDir, 'empty_nobm.log');
      let appendDone   = false;
      let readLines    = 0;

      await newFile(emptyLog, '');
      const s = await stat(emptyLog);
      try { await unlink(join(readerOpts.bookmark.dir, s.ino.toString())); } catch { /* ignore */ }

      let r;
      await new Promise(resolve => {
        r = createReader(emptyLog, readerOpts)
          .on('read', (data, lineCount) => {
            if (appendDone && ++readLines === 2) {
              setTimeout(() => r.watchStop(emptyLog), 500);
              resolve();
            }
          })
          .on('drain', next => { next(); })
          .on('end', () => {
            if (appendDone) return;
            fork(fileAppendPath, {
              env: { FILE_PATH: emptyLog, LOG_LINE: logLine + '\n' + logLine + '\n' },
            }).on('message', () => { appendDone = true; });
          });
      });
    });

    it('reads lines appended to empty file with old bookmark', async () => {
      const bookmark = new Bookmark(readerOpts.bookmark.dir);
      const emptyLog = join(dataDir, 'empty_oldbm.log');
      let appendDone = false;
      let readLines  = 0;

      await newFile(emptyLog, '');
      await bookmark.save({ file: emptyLog, lines: 12087, bytes: 4242424242 });

      let r;
      await new Promise(resolve => {
        r = createReader(emptyLog, readerOpts)
          .on('read', (data, lineCount) => {
            if (appendDone && ++readLines === 2) {
              setTimeout(() => r.watchStop(emptyLog), 500);
              resolve();
            }
          })
          .on('drain', next => { next(); })
          .on('end', () => {
            if (appendDone) return;
            fork(fileAppendPath, {
              env: { FILE_PATH: emptyLog, LOG_LINE: logLine + '\n' + logLine + '\n' },
            }).on('message', () => { appendDone = true; });
          });
      });
    });
  });
});
