'use strict';

if (process.env.COVERAGE) require('blanket');

var events    = require('events');
var fs        = require('fs');
var path      = require('path');
var util      = require('util');
var zlib      = require('zlib');
var EOL       = require('os').EOL;

var logger    = require('./lib/logger');
var Bookmark  = require('./lib/bookmark');
var Splitter  = require('./lib/line-splitter');

function Reader (fileOrPath, options) {
  events.EventEmitter.call(this);

  // the file we're reading lines from
  this.filePath     = path.resolve(fileOrPath);
  this.isArchive    = false;
  this.sawEndOfFile = false;
  this.canUseBookmarkBytes = false;
  this.startBytes   = 0;
  this.watchDelay   = process.env.NODE_ENV === 'test' ? 100 : 2000;

  if (!options) options = { bookmark: { } };
  this.watchOpts    = { persistent: true, recursive: false };
  this.encoding     = options.encoding   || 'utf8';
  this.noBookmark   = options.noBookmark || false;
  this.bookmark     = new Bookmark(options.bookmark.dir ||
      path.resolve('./', '.bookmark'));
  if (options.watchDelay) this.watchDelay = options.watchDelay * 1000;

  this.batch        = { count: 0, limit: 0, delay: 0 };

  if (options.batchLimit) this.batch.limit = options.batchLimit;
  if (options.batchDelay) this.batch.delay = options.batchDelay;

  this.resetPosition();

  this.startReader();
}

util.inherits(Reader, events.EventEmitter);

Reader.prototype.resetPosition = function() {
  this.lines = { start: 0, position: 0, skip: 0 };
  this.bytesOffset  = 0;
};

Reader.prototype.startReader = function() {
  var slr = this;

  // does the log file exist?
  fs.stat(slr.filePath, function (err, stat) {
    if (err) {
      if (err.code === 'ENOENT') {
        logger.info('watching for ' + slr.filePath + ' to appear');
        return slr.watch(slr.filePath);
      }
      logger.error(err);
      return;
    }

    slr.createStream();  // a Transform stream
  });
};

Reader.prototype.endStream = function () {
  var slr = this;
  logger.info('end of ' + this.filePath);

  if (slr.sawEndOfFile) {
    logger.debug('endStream: dampening extra EOF');
    return;
  }
  slr.sawEndOfFile = true;
  slr.canUseBookmarkBytes = true;
  slr.linesAtEndOfFile = slr.lines.position;

  var notifyAndWatch = function () {
    slr.emit('drain', function (err, delay) {
      slr.batchSaveDone(err, delay);
    });
    slr.emit('end');
    slr.watch(slr.filePath);
  };

  notifyAndWatch();
};

Reader.prototype.readLine = function () {
  var slr = this;

  slr.canUseBookmarkBytes = false;

  if (slr.alreadyRead()) return;
  if (slr.batchIsFull()) return;

  var line = slr.liner.read();
  if (line === null) {                // EOF
    return;
  }

  slr.batch.count++;
  slr.lines.position++;
  if (line) slr.bytesOffset += (line.length + EOL.length);
  slr.emit('read', line, slr.lines.position);
};

Reader.prototype.alreadyRead = function() {
  var slr = this;

  if (slr.lines.start && slr.lines.position < slr.lines.start) {
    slr.lines.skip++;
    var line = slr.liner.read();
    if (line) slr.bytesOffset += (line.length + EOL.length);
    slr.lines.position++;
    return true;
  }

  if (slr.lines.skip) {
    logger.info('\tskipped ' + slr.lines.skip + ' lines');
    slr.lines.skip = 0;
  }

  return false;
};

Reader.prototype.batchIsFull = function() {
  var slr = this;
  if (!slr.batch.limit) return;
  if (slr.batch.count < slr.batch.limit) return;

  logger.debug('batchIsFull, limit: ' + slr.batch.limit +
      ' count: ' + slr.batch.count);

  process.nextTick(function () {
    slr.emit('drain', function (err, delay) {
      slr.batchSaveDone(err, delay);
    });
  });
  return true;
};

Reader.prototype.batchSaveDone = function (err, delay) {
  var slr = this;

  var saveArgs = {
    file:  slr.filePath,
    lines: slr.lines.position,
    bytes: slr.bytesOffset,
  };

  slr.bookmark.save(saveArgs, function (err) {
    if (err) {
      logger.error(err);
      logger.error('bookmark save failed, halting');
      return;
    }
    slr.batch.count = 0;
    if (!slr.liner.readable) return;

    // the log shipper can ask us to wait 'delay' seconds before
    // emitting the next batch. This is useful as a backoff mechanism.
    if (isNaN(delay)) delay = slr.batch.delay;
    if (delay) console.log('\t\tpause ' + delay + ' seconds');

    setTimeout(function () {
      for (var i=0; i<=slr.batch.limit; i++) {
        if (slr.liner.readable) slr.readLine();
      }
    }, delay * 1000);
  });
};

Reader.prototype.createStream = function () {
  var slr = this;
  // entered when:
  //     new startup
  //     after EOF, when fs.watch saw a change
  //
  // with transform streams, files/archives are closed automatically
  // at EOF. Reset the line position upon (re)open.
  this.resetPosition();

  // splitters are gone after EOF. Start a new one
  this.lineSplitter();

  slr.bookmark.read(slr.filePath, function (err, mark) {
    if (err && err.code !== 'ENOENT') {
      logger.error('Error reading bookmark: ' + err.message);
      return;
    }

    if (/\.gz$/.test(slr.filePath)) {
      if (mark && mark.lines && !slr.noBookmark) {
        logger.debug('\tlines.start: ' + mark.lines);
        slr.lines.start = mark.lines;
      }
      return slr.createStreamGzip();
    }
    // if (/\.bz2$/.test(slr.filePath)) return slr.createStreamBz2();

    // options used only by plain text log files
    var fileOpts = {
      autoClose: true,
      encoding: slr.encoding,
    };

    if (mark && !slr.noBookmark) {
      // the only time byte position is safe is when we've read to EOF.
      // Otherwise, the byte position contains buffered data that hasn't
      // been emitted as lines.
      // This is now saved in a separate variable

      // the alternative to 'start' here, is splitting the entire file
      // into lines (again) and counting lines. Avoid if possible.
      if (slr.canUseBookmarkBytes && mark.size) {
        if (slr.linesAtEndOfFile !== mark.lines) {
          logger.error('lines@EOF: ' + slr.linesAtEndOfFile);
          logger.error('mark.lines: ' + mark.lines);
        }
        logger.info('\tbytes.start: ' + mark.size + ' (lines: ' + mark.lines + ')');
        fileOpts.start = mark.size;
        slr.lines.position = mark.lines;
        slr.bytesOffset = mark.size;
      }
      else if (mark.lines) {
        logger.debug('\tlines.start: ' + mark.lines);
        slr.lines.start = mark.lines;
      }
    }

    // we need to start fresh
    slr.sawEndOfFile = false;

    logger.debug('opening for read: ' + slr.filePath);
    fs.createReadStream(slr.filePath, fileOpts).pipe(slr.liner);
  });
};

Reader.prototype.createStreamGzip = function() {
  this.isArchive = true;

  fs.createReadStream(this.filePath)
    .pipe(zlib.createGunzip())
    .pipe(this.liner);
};
/*
Reader.prototype.createStreamBz2 = function() {
  this.isArchive = true;

// ick. to use in pipe, compressjs has a node-gyp dep. I think I'd
// rather spawn a child process using CLI bunzip2. TODO
  throw('no bzip2 support yet');
};
*/
Reader.prototype.lineSplitter = function () {
  var slr = this;

  slr.liner = new Splitter({
    encoding: this.encoding,   // for archives
  })
    .on('readable', function () {
      if (process.env.WANTS_SHUTDOWN) return; // cease reading
      slr.emit('testSetup');
      slr.readLine();
    })
    .on('end', function () {
      slr.endStream();
    });
};

Reader.prototype.resolveAncestor = function (filePath, done) {
  var slr = this;

  // fs apex, break recursion
  if (filePath === '/') return done(null, filePath);

  // walk up a directory tree until an existing one is found
  fs.stat(filePath, function (err, stat) {
    if (err) {
      // logger.info('resolveAncestor: ' + err.code);
      if (err.code === 'ENOENT') {
        return slr.resolveAncestor(path.dirname(filePath), done);
      }
      return done(err);
    }
    logger.debug('\tresolveAncestor: ' + filePath);
    done(null, filePath);
  });
};

Reader.prototype.watch = function (fileOrDir) {
  var slr = this;

  // archives don't get appended, don't watch
  if (slr.isArchive) return;

  slr.resolveAncestor(fileOrDir, function (err, existentPath) {
    if (err) return logger.error(err);

    logger.info('watching ' + existentPath);

    slr.isWatchingParent = existentPath === fileOrDir ? false : true;

    slr.watcher = fs.watch(
      existentPath,
      slr.watchOpts,
      slr.watchEvent.bind(slr)
    );
  });
};

Reader.prototype.watchEvent = function (event, filename) {
  logger.debug('watcher saw ' + event + ' on ' + filename);

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
};

Reader.prototype.watchChange = function (filename) {
  var slr = this;

  // Depending on underlying OS semantics, we can get multiple of these
  // events in rapid succession. ignore subsequent.
  if (!slr.watcher) return;

  slr.watcher.close();
  slr.watcher = null;

  // give the events a chance to settle
  setTimeout(function () { slr.createStream(); }, slr.watchDelay);
};

Reader.prototype.watchRename = function (filename) {
  // logger.info('\trename: ' + filename);

  if (this.watcher) {
    this.watcher.close();
    this.watcher = null;
  }

  switch (process.platform) {
    case 'darwin':
      this.renameMacOS(filename);
      return;
    case 'freebsd':
    case 'linux':
      this.renameLinux(filename);
      return;
    default:
      // falls through
      logger.error('report this as GitHub Issue:\n' +
        '\trename: ' + filename + ' on ' + process.platform
      );
  }
};

Reader.prototype.renameLinux = function (filename) {
  var slr = this;
  // we only get the source filename (foo.log), not dest

  // what happened? (create, delete, move)
  fs.stat(slr.filePath, function (err, stats) {
    if (err) {
      if (err.code === 'ENOENT') {  // mv or rm
        slr.lines.start = 0;
        // watch for file to reappear
        slr.watch(slr.filePath);
        return;
      }
      logger.error(err);
    }

    logger.debug(stats);
    setTimeout(function () {
      slr.createStream();
    }, slr.watchDelay);
  });
};

Reader.prototype.renameMacOS = function (filename) {
  var slr = this;

  slr.lines.start = 0;

  // log file just (re)appeared
  if (filename === path.basename(slr.filePath)) {
    setTimeout(function () {
      slr.createStream();
    }, slr.watchDelay);
    return;
  }

  // slr.watch handles case when file does not exist
  slr.watch(slr.filePath);
};

module.exports = {
  createReader: function (filePath, options) {
    return new Reader(filePath, options);
  }
};
