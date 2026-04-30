import { EventEmitter } from 'node:events';
import { createReadStream, watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { createGunzip } from 'node:zlib';
import { EOL } from 'node:os';

import * as logger from './lib/logger.js';
import Bookmark from './lib/bookmark.js';
import { LineSplitter } from './lib/line-splitter.js';

class Reader extends EventEmitter {

  constructor(fileOrPath, options) {
    super();
    this.filePath          = resolve(fileOrPath);
    this.isArchive         = false;
    this.sawEndOfFile      = false;
    this.canUseBookmarkBytes = false;
    this.startBytes        = 0;
    this.watchDelay        = process.env.NODE_ENV === 'test' ? 100 : 2000;

    this.#applyOptions(options);
    this.bookmark = new Bookmark(this.bookmarkDir);
    this.#resetPosition();
    this.#startReader();
  }

  #applyOptions(options = { bookmark: {} }) {
    this.watchOpts   = { persistent: true, recursive: false };
    this.encoding    = options.encoding    || 'utf8';
    this.noBookmark  = options.noBookmark  || false;
    this.bookmarkDir = options.bookmark?.dir || resolve('./', '.bookmark');
    this.batch       = { count: 0, limit: 0, delay: 0 };
    if (options.batchLimit) this.batch.limit = options.batchLimit;
    if (options.batchDelay) this.batch.delay = options.batchDelay;
    if (options.watchDelay) this.watchDelay  = options.watchDelay * 1000;
  }

  #resetPosition() {
    this.lines       = { start: 0, position: 0, skip: 0 };
    this.bytesOffset = 0;
  }

  async #startReader() {
    try {
      await stat(this.filePath);
      this.#createStream();
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.info(`watching for ${this.filePath} to appear`);
        this.#watch(this.filePath);
      } else {
        logger.error(err);
      }
    }
  }

  #notifyAndWatch() {
    this.emit('drain', (err, delay) => { this.#batchSaveDone(err, delay); });
    this.emit('end');
    this.#watch(this.filePath);
  }

  #endStream() {
    logger.info(`end of ${this.filePath}`);
    if (this.sawEndOfFile) { logger.debug('endStream: dampening extra EOF'); return; }
    this.sawEndOfFile        = true;
    this.canUseBookmarkBytes = true;
    this.linesAtEndOfFile    = this.lines.position;
    this.#notifyAndWatch();
  }

  #readLine() {
    this.canUseBookmarkBytes = false;
    if (this.#alreadyRead()) return 'skipping';
    if (this.#batchIsFull()) return false;

    const line = this.liner.read();
    if (line === null) return false;

    this.batch.count++;
    this.lines.position++;
    if (line) this.bytesOffset += line.length + EOL.length;
    this.emit('read', line, this.lines.position);
    return true;
  }

  #alreadyRead() {
    if (this.lines.start && this.lines.position < this.lines.start) {
      this.lines.skip++;
      const line = this.liner.read();
      if (line) this.bytesOffset += line.length + EOL.length;
      this.lines.position++;
      return true;
    }
    if (this.lines.skip) {
      logger.info(`\tskipped ${this.lines.skip} lines`);
      this.lines.skip = 0;
    }
    return false;
  }

  #batchIsFull() {
    if (!this.batch.limit || this.batch.count < this.batch.limit) return false;
    logger.debug(`batchIsFull, limit: ${this.batch.limit} count: ${this.batch.count}`);
    process.nextTick(() => {
      this.emit('drain', (err, delay) => { this.#batchSaveDone(err, delay); });
    });
    return true;
  }

  async #batchSaveDone(err, delay) {
    try {
      await this.bookmark.save({
        file:  this.filePath,
        lines: this.lines.position,
        bytes: this.bytesOffset,
      });
    } catch (saveErr) {
      logger.error(saveErr);
      logger.error('bookmark save failed, halting');
      return;
    }
    this.batch.count = 0;
    if (!this.liner.readable) return;

    if (isNaN(delay)) delay = this.batch.delay;
    if (delay) console.log(`\t\tpause ${delay} seconds`);

    setTimeout(() => {
      for (let i = 0; i <= this.batch.limit; i++) {
        if (this.liner.readable) this.#readLine();
      }
    }, delay * 1000);
  }

  async #createStream() {
    this.#resetPosition();
    this.#lineSplitter();

    let mark = null;
    try {
      mark = await this.bookmark.read(this.filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.error(`Error reading bookmark: ${err.message}`);
        return;
      }
    }

    if (/\.gz$/.test(this.filePath)) {
      if (mark?.lines && !this.noBookmark) {
        logger.debug(`\tlines.start: ${mark.lines}`);
        this.lines.start = mark.lines;
      }
      return this.#createStreamGzip();
    }

    const fileOpts = { autoClose: true, encoding: this.encoding };

    if (mark && !this.noBookmark) {
      if (this.canUseBookmarkBytes && mark.size) {
        if (this.linesAtEndOfFile !== mark.lines) {
          logger.error(`lines@EOF: ${this.linesAtEndOfFile}`);
          logger.error(`mark.lines: ${mark.lines}`);
        }
        logger.info(`\tbytes.start: ${mark.size} (lines: ${mark.lines})`);
        fileOpts.start      = mark.size;
        this.lines.position = mark.lines;
        this.bytesOffset    = mark.size;
      } else if (mark.lines) {
        logger.debug(`\tlines.start: ${mark.lines}`);
        this.lines.start = mark.lines;
      }
    }

    this.sawEndOfFile = false;
    logger.debug(`opening for read: ${this.filePath}`);
    createReadStream(this.filePath, fileOpts).pipe(this.liner);
  }

  #createStreamGzip() {
    this.isArchive = true;
    createReadStream(this.filePath).pipe(createGunzip()).pipe(this.liner);
  }

  #lineSplitter() {
    this.liner = new LineSplitter({ encoding: this.encoding })
      .on('readable', () => {
        if (process.env.WANTS_SHUTDOWN) return;
        this.emit('testSetup');
        while (this.#readLine()) { /* consume all buffered lines */ }
      })
      .on('end', () => { this.#endStream(); });
  }

  async #resolveAncestor(filePath) {
    if (filePath === '/') return filePath;
    try {
      await stat(filePath);
      logger.debug(`\tresolveAncestor: ${filePath}`);
      return filePath;
    } catch (err) {
      if (err.code === 'ENOENT') return this.#resolveAncestor(dirname(filePath));
      throw err;
    }
  }

  async #watch(fileOrDir) {
    if (this.isArchive) return;
    try {
      const existentPath   = await this.#resolveAncestor(fileOrDir);
      logger.info(`watching ${existentPath}`);
      this.isWatchingParent = existentPath !== fileOrDir;
      this.watcher = watch(existentPath, this.watchOpts, this.#watchEvent.bind(this));
    } catch (err) {
      logger.error(err);
    }
  }

  #watchEvent(event, filename) {
    logger.debug(`watcher saw ${event} on ${filename}`);
    if (this.isWatchingParent && filename !== basename(this.filePath)) {
      this.emit('irrelevantFile', filename);
      return;
    }
    if (event === 'change') this.#watchChange(filename);
    else if (event === 'rename') this.#watchRename(filename);
  }

  watchStop(filename) {
    logger.debug(`stopping watching ${filename}`);
    if (!this.watcher) return;
    this.watcher.close();
    this.watcher = null;
  }

  #watchChange() {
    if (!this.watcher) return;
    this.watchStop(this.filePath);
    setTimeout(() => { this.#createStream(); }, this.watchDelay);
  }

  #watchRename(filename) {
    if (this.watcher) this.watchStop('');
    switch (process.platform) {
      case 'darwin': this.#renameMacOS(filename); break;
      case 'freebsd':
      case 'linux':
      case 'win32':  this.#renameLinux(filename); break;
      default:
        logger.error(`report this as GitHub Issue:\n\trename: ${filename} on ${process.platform}`);
    }
  }

  async #renameLinux() {
    try {
      const stats = await stat(this.filePath);
      logger.debug(stats);
      setTimeout(() => { this.#createStream(); }, this.watchDelay);
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.lines.start = 0;
        this.#watch(this.filePath);
      } else {
        logger.error(err);
      }
    }
  }

  #renameMacOS(filename) {
    this.lines.start = 0;
    if (filename === basename(this.filePath)) {
      setTimeout(() => { this.#createStream(); }, this.watchDelay);
    } else {
      this.#watch(this.filePath);
    }
  }
}

export function createReader(filePath, options) {
  return new Reader(filePath, options);
}

export default { createReader };
