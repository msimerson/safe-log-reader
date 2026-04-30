import assert from 'node:assert';
import { stat, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { Bookmark } from '../lib/bookmark.js';

const bookDir = resolve('test', '.bookmarks');
const book    = new Bookmark(bookDir);

describe('bookmark', function () {

  const testFile = resolve('./test', 'data', 'test.log');

  it('creates missing bookmark dir', async () => {
    const missingDir = resolve('test', 'missing-dir');
    const b = new Bookmark(missingDir);
    await b.createDir();
    const s = await stat(missingDir);
    assert.ok(s.isDirectory());
    await rmdir(missingDir);
  });

  it('saves a bookmark', async () => {
    await book.save({ file: testFile, lines: 45 });
  });

  it('reads a bookmark', async () => {
    const mark = await book.read(testFile);
    assert.equal(mark.lines, 45);
  });

  it('errors on unwritable bookmark dir', async () => {
    const noPermDir = resolve('test', 'data', 'nowrite', 'newdir-' + Date.now());
    const b = new Bookmark(noPermDir);
    await assert.rejects(b.createDir());
  });

  it('errs on unreadable bookmark', async () => {
    const noReadDir = resolve('test', 'data', 'noread');
    const b = new Bookmark(noReadDir);
    await assert.rejects(b.read(resolve(noReadDir, 'file')));
  });
});

describe('error handling', function () {

  const testFile = resolve('./test', 'data', 'test.log');

  it('save emits debugging on stat error', { timeout: 4000 }, async () => {
    process.env.MOCK_STAT_ERROR = 'true';
    await assert.rejects(book.save({ file: testFile, lines: 45 }));
    process.env.MOCK_STAT_ERROR = 'false';
  });
});
