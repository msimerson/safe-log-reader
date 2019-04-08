'use strict';

if (process.env.COVERAGE) require('blanket');

const events    = require('events');
const fs        = require('fs');
const path      = require('path');
const zlib      = require('zlib');
const EOL       = require('os').EOL;

const logger    = require('./lib/logger');
const Bookmark  = require('./lib/bookmark');
const Splitter  = require('./lib/line-splitter');

class Reader extends events.EventEmitter {

  constructor (fileOrPath, options) {
    super()

    // the file we're reading lines from
    this.filePath     = path.resolve(fileOrPath);
    this.isArchive    = false;
    this.sawEndOfFile = false;
    this.canUseBookmarkBytes = false;
    this.startBytes   = 0;
    this.watchDelay   = process.env.NODE_ENV === 'test' ? 100 : 2000;

    this.applyOptions(options)

    this.bookmark = new Bookmark(this.bookmarkDir)
    this.resetPosition()
    this.startReader()
  }

  applyOptions (options) {
    if (!options) options = { bookmark: { } };

    this.watchOpts  = { persistent: true, recursive: false };
    this.encoding   = options.encoding   || 'utf8';
    this.noBookmark = options.noBookmark || false;
    this.bookmarkDir = options.bookmark.dir || path.resolve('./', '.bookmark');

    this.batch     = { count: 0, limit: 0, delay: 0 };

    if (options.batchLimit) this.batch.limit = options.batchLimit;
    if (options.batchDelay) this.batch.delay = options.batchDelay;
    if (options.watchDelay) this.watchDelay = options.watchDelay * 1000;
  }

  resetPosition () {
    this.lines = { start: 0, position: 0, skip: 0 };
    this.bytesOffset  = 0;
  }

  startReader () {
    // does the log file exist?
    fs.stat(this.filePath, (err, stat) => {
      if (err) {
        if (err.code === 'ENOENT') {
          logger.info(`watching for ${this.filePath} to appear`);
          return this.watch(this.filePath);
        }
        logger.error(err);
        return;
      }

      this.createStream();  // a Transform stream
    })
  }

  notifyAndWatch () {
    this.emit('drain', (err, delay) => { this.batchSaveDone(err, delay); })
    this.emit('end');
    this.watch(this.filePath);
  }

  endStream () {
    logger.info(`end of ${this.filePath}`);

    if (this.sawEndOfFile) {
      logger.debug('endStream: dampening extra EOF');
      return;
    }
    this.sawEndOfFile = true;
    this.canUseBookmarkBytes = true;
    this.linesAtEndOfFile = this.lines.position;

    this.notifyAndWatch();
  }

  readLine () {
    this.canUseBookmarkBytes = false;

    if (this.alreadyRead()) return;
    if (this.batchIsFull()) return;

    const line = this.liner.read();
    // console.log(`\treadLine from ${path.basename(this.filePath)}: ${line}`)
    if (line === null) return;         // EOF

    this.batch.count++;
    this.lines.position++;
    if (line) this.bytesOffset += (line.length + EOL.length);
    this.emit('read', line, this.lines.position);
  }

  alreadyRead () {
    if (this.lines.start && this.lines.position < this.lines.start) {
      this.lines.skip++;
      const line = this.liner.read();
      if (line) this.bytesOffset += (line.length + EOL.length);
      this.lines.position++;
      return true;
    }

    if (this.lines.skip) {
      logger.info(`\tskipped ${this.lines.skip} lines`);
      this.lines.skip = 0;
    }

    return false;
  }

  batchIsFull () {
    if (!this.batch.limit) return;
    if (this.batch.count < this.batch.limit) return;

    logger.debug(`batchIsFull, limit: ${this.batch.limit} count: ${this.batch.count}`);

    process.nextTick(() => {
      this.emit('drain', (err, delay) => {
        this.batchSaveDone(err, delay);
      })
    })

    return true;
  }

  batchSaveDone (err, delay) {

    const saveArgs = {
      file:  this.filePath,
      lines: this.lines.position,
      bytes: this.bytesOffset,
    }

    this.bookmark.save(saveArgs, (err) => {
      if (err) {
        logger.error(err);
        logger.error('bookmark save failed, halting');
        return;
      }
      this.batch.count = 0;
      if (!this.liner.readable) return;

      // the log shipper can ask us to wait 'delay' seconds before
      // emitting the next batch. This is useful as a backoff mechanism.
      if (isNaN(delay)) delay = this.batch.delay;
      if (delay) console.log(`\t\tpause ${delay} seconds`);

      setTimeout(() => {
        for (let i=0; i<=this.batch.limit; i++) {
          if (this.liner.readable) this.readLine();
        }
      }, delay * 1000);
    })
  }

  createStream () {
    // entered when:
    //     new startup
    //     after EOF, when fs.watch saw a change
    //
    // with transform streams, files/archives are closed automatically
    // at EOF. Reset the line position upon (re)open.
    this.resetPosition();

    // splitters are gone after EOF. Start a new one
    this.lineSplitter();

    this.bookmark.read(this.filePath, (err, mark) => {
      if (err && err.code !== 'ENOENT') {
        logger.error(`Error reading bookmark: ${err.message}`);
        return;
      }

      if (/\.gz$/.test(this.filePath)) {
        if (mark && mark.lines && !this.noBookmark) {
          logger.debug('\tlines.start: ' + mark.lines);
          this.lines.start = mark.lines;
        }
        return this.createStreamGzip();
      }
      // if (/\.bz2$/.test(this.filePath)) return this.createStreamBz2();

      // options used only by plain text log files
      const fileOpts = {
        autoClose: true,
        encoding: this.encoding,
      }

      if (mark && !this.noBookmark) {
        // the only time byte position is safe is when we've read to EOF.
        // Otherwise, the byte position contains buffered data that hasn't
        // been emitted as lines.
        // This is now saved in a separate variable

        // the alternative to 'start' here, is splitting the entire file
        // into lines (again) and counting lines. Avoid if possible.
        if (this.canUseBookmarkBytes && mark.size) {
          if (this.linesAtEndOfFile !== mark.lines) {
            logger.error(`lines@EOF: ${this.linesAtEndOfFile}`);
            logger.error(`mark.lines: ${mark.lines}`);
          }
          logger.info(`\tbytes.start: ${mark.size} (lines: ${mark.lines} )`);
          fileOpts.start = mark.size;
          this.lines.position = mark.lines;
          this.bytesOffset = mark.size;
        }
        else if (mark.lines) {
          logger.debug(`\tlines.start: ${mark.lines}`);
          this.lines.start = mark.lines;
        }
      }

      // we need to start fresh
      this.sawEndOfFile = false;

      logger.debug(`opening for read: ${this.filePath}`);
      fs.createReadStream(this.filePath, fileOpts).pipe(this.liner);
    })
  }

  createStreamGzip () {
    this.isArchive = true;

    fs.createReadStream(this.filePath).pipe(zlib.createGunzip()).pipe(this.liner);
  }

  createStreamBz2 () {
    this.isArchive = true;

    // ick. to use in pipe, compressjs has a node-gyp dep. I think I'd
    // rather spawn a child process using CLI bunzip2. TODO
    throw('no bzip2 support yet');
  }

  lineSplitter () {

    this.liner = new Splitter({
      encoding: this.encoding,   // for archives
    })
      .on('readable', () => {
        if (process.env.WANTS_SHUTDOWN) return; // cease reading
        this.emit('testSetup')
        this.readLine();
      })
      .on('end', () => {
        this.endStream();
      })
  }

  resolveAncestor (filePath, done) {

    // fs apex, break recursion
    if (filePath === '/') return done(null, filePath);

    // walk up a directory tree until an existing one is found
    fs.stat(filePath, (err, stat) => {
      if (err) {
        // logger.info('resolveAncestor: ' + err.code);
        if (err.code === 'ENOENT') {
          return this.resolveAncestor(path.dirname(filePath), done);
        }
        return done(err);
      }
      logger.debug(`\tresolveAncestor: ${filePath}`);
      done(null, filePath);
    })
  }

  watch (fileOrDir) {

    // archives don't get appended, don't watch
    if (this.isArchive) return;

    this.resolveAncestor(fileOrDir, (err, existentPath) => {
      if (err) return logger.error(err);

      logger.info(`watching ${existentPath}`);

      this.isWatchingParent = existentPath === fileOrDir ? false : true;

      this.watcher = fs.watch(
        existentPath,
        this.watchOpts,
        this.watchEvent.bind(this)
      );
    })
  }

  watchEvent (event, filename) {
    logger.debug(`watcher saw ${event} on ${filename}`);

    if (this.isWatchingParent) {
      // make sure event filename matches
      if (filename !== path.basename(this.filePath)) {
        this.emit('irrelevantFile', filename);
        return;
      }
    }

    switch (event) {
      case 'change':
        this.watchChange(filename);
        break;
      case 'rename':
        this.watchRename(filename);
        break;
    }
  }

  watchStop (filename) {
    logger.debug(`stopping watching ${filename}`)
    if (!this.watcher) return;
    this.watcher.close();
    this.watcher = null;
  }

  watchChange (filename) {

    // Depending on underlying OS semantics, we can get multiple of these
    // events in rapid succession. ignore subsequent.
    if (!this.watcher) return;

    this.watchStop(this.filePath);

    // give the events a chance to settle
    setTimeout(() => { this.createStream(); }, this.watchDelay);
  }

  watchRename (filename) {
    // logger.info('\trename: ' + filename);

    if (this.watcher) this.watchStop('');

    switch (process.platform) {
      case 'darwin':
        this.renameMacOS(filename);
        break;
      case 'freebsd':
      case 'linux':
        this.renameLinux(filename);
        break;
      case 'win32':
        this.renameLinux(filename);
        break;
      default:
        // falls through
        logger.error(`report this as GitHub Issue:\n\trename: ${filename} on ${process.platform}`)
    }
  }

  renameLinux (filename) {
    // we only get the source filename (foo.log), not dest

    // what happened? (create, delete, move)
    fs.stat(this.filePath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {  // mv or rm
          this.lines.start = 0;
          // watch for file to reappear
          this.watch(this.filePath);
          return;
        }
        logger.error(err);
      }

      logger.debug(stats);
      setTimeout(() => {
        this.createStream();
      }, this.watchDelay);
    })
  }

  renameMacOS (filename) {

    this.lines.start = 0;

    // log file just (re)appeared
    if (filename === path.basename(this.filePath)) {
      setTimeout(() => {
        this.createStream();
      }, this.watchDelay);
      return;
    }

    // this.watch handles case when file does not exist
    this.watch(this.filePath);
  }
}

module.exports = {
  createReader: function (filePath, options) {
    return new Reader(filePath, options);
  }
}
