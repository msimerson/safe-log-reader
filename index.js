'use strict';

if (process.env.COVERAGE) require('blanket');

var events    = require('events');
var fs        = require('fs');
var path      = require('path');
var util      = require('util');
var zlib      = require('zlib');

var logger    = require('./lib/logger');
var Bookmark  = require('./lib/bookmark');
var Splitter  = require('./lib/line-splitter');

function Reader (fileOrPath, options) {
  events.EventEmitter.call(this);

  // the file we're reading lines from
  this.filePath     = path.resolve(fileOrPath);
  this.isArchive    = false;
  this.sawEndOfFile = false;
  this.startBytes   = 0;
  this.watchDelay   = process.env.NODE_ENV === 'test' ? 100 : 2000;

  if (!options) options = { bookmark: { } };
  this.watchOpts    = { persistent: true, recursive: false };
  this.encoding     = options.encoding   || 'utf8';
  this.noBookmark   = options.noBookmark || false;
  this.bookmark     = new Bookmark(options.bookmark.dir ||
      path.resolve('./', '.bookmark'));
  if (options.watchDelay) this.watchDelay = options.watchDelay * 1000;

  this.lines        = { start: 0, position: 0, skip: 0 };
  this.batch        = { count: 0, limit: 0 };

  if (options.batchLimit) this.batch.limit = options.batchLimit;

  this.startReader();
}

util.inherits(Reader, events.EventEmitter);

Reader.prototype.startReader = function() {
  var slr = this;

  // does the log file exist?
  fs.stat(slr.filePath, function (err, stat) {
    if (err) {
      if (err.code === 'ENOENT') {
        logger.info('watching for ' + slr.filePath + ' to appear');
        return slr.watch(slr.filePath);
      }
      return logger.error(err);
    }

    slr.createStream();  // a Transform stream
  });
};

Reader.prototype.endStream = function () {
  var slr = this;
  logger.info('end of ' + this.filePath);

  if (this.sawEndOfFile) {
    logger.debug('endStream: dampening extra EOF');
    return;
  }
  this.sawEndOfFile = true;

  var notifyAndWatch = function () {
    slr.emit('end');
    slr.watch(slr.filePath);
  };

  if (slr.noBookmark) {
    logger.info('\tnoBookmark=true, ignoring');
    return notifyAndWatch();
  }

  slr.bookmark.save(slr.filePath, slr.lines.position, function (err) {
    if (err) {
      logger.error(err);
      logger.error('unable to save bookmark, refusing to continue');
      return;
    }
    notifyAndWatch();
  });
};

Reader.prototype.readLine = function () {
  var slr = this;

  if (slr.alreadyRead()) return;
  if (slr.batchIsFull()) return;

  var line = slr.liner.read();
  if (line === null) return;              // EOF

  slr.batch.count++;
  slr.lines.position++;
  slr.emit('read', line, slr.lines.position);
  if (!slr.liner.readable) return;
  slr.readLine();
};

Reader.prototype.alreadyRead = function() {
  var slr = this;

  if (slr.lines.start && slr.lines.position < slr.lines.start) {
    slr.lines.skip++;
    slr.liner.read();
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
  if (!this.batch.limit) return;
  if (this.batch.count < this.batch.limit) return;

  logger.info('batchlimit: ' + this.batch.count);
  var slr = this;

  slr.emit('end', function (err, delay) {
    slr.bookmark.save(slr.filePath, slr.lines.position, function (err) {
      if (err) {
        logger.error(err);
        logger.error('bookmark save failed, halting');
        return;
      }
      slr.batch.count = 0;

      // the log shipper can ask us to wait 'delay' seconds before
      // emitting the next batch. This is useful as a backoff mechanism.
      if (isNaN(delay)) delay = 5;
      if (!delay) return slr.readLine();

      setTimeout(function () {
        console.log('\t\tpause ' + delay + ' seconds');
        slr.readLine();
      }, delay * 1000);
    });
  });
  return true;
};

Reader.prototype.createStream = function () {
  var slr = this;
  // entered when:
  //     new startup
  //     after EOF, when fs.watch saw a change
  //
  // with transform streams, files/archives are closed for us
  // automatically at EOF. Reset the line position upon (re)open.
  this.lines.position = 0;

  // splitters are gone after EOF, always start a new one
  this.lineSplitter();

  slr.bookmark.read(slr.filePath, function (err, mark) {
    if (err && err.code !== 'ENOENT') {
      logger.error('Error trying to read bookmark:');
      logger.error(err.message);
      return;
    }

    if (mark && !slr.noBookmark && mark.lines) {
      logger.debug('\tlines.start: ' + mark.lines);
      slr.lines.start = mark.lines;
    }

    if (/\.gz$/.test(slr.filePath)) return slr.createStreamGzip();
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

      // the alternative to 'start' here, is splitting the entire file
      // into lines (again) and counting lines. Avoid that when possible.
      if (slr.sawEndOfFile && mark.size) {
        logger.info('\tbytes.start: ' + mark.size);
        fileOpts.start = mark.size;
        slr.sawEndOfFile = false;
        slr.lines.position = mark.lines;
      }
    }

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
  .on('readable', function () { slr.emit('readable'); })
  .on('end',      function () { slr.endStream();      });
};

Reader.prototype.resolveAncestor = function (filePath, done) {
  var slr = this;
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
    slr.watcher = fs.watch(
      existentPath,
      slr.watchOpts,
      slr.watchEvent.bind(slr)
    );
  });
};

Reader.prototype.watchEvent = function (event, filename) {
  logger.debug('watcher saw ' + event + ' on ' + filename);
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
  // we can get multiple of these in rapid succession.
  // ignore subsequent...
  if (!slr.watcher) return;

  slr.watcher.close();
  slr.watcher = null;

  // give the events a chance to settle
  setTimeout(function () { slr.createStream(); }, slr.watchDelay);
};

Reader.prototype.watchRename = function (filename) {
  // logger.info('\trename: ' + filename);
  this.watcher.close();
  this.watcher = null;

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
        // watch parent dir for file to reappear
        slr.watch(path.dirname(slr.filePath));
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

  // log file moved away (likely: foo.log -> foo.log.1)
  slr.watch(path.dirname(slr.filePath));
};

module.exports = {
  createReader: function (filePath, options) {
    return new Reader(filePath, options);
  }
};
