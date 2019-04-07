'use strict';

var fs      = require('fs');
var path    = require('path');

var logger  = require('./logger');

function Bookmark (dir, options) {
  // logger.info(arguments);
  if (!dir) dir = './.bookmark';

  this.dirPath = path.resolve(dir);

  // if the directory doesn't exist, try to make it
  this.createDir(function () {
    logger.debug(this);
  });
}

Bookmark.prototype.createDir = function(done) {
  var bm = this;

  fs.stat(bm.dirPath, function (err, stat) {
    if (!err) return done(err);    // already exists

    if (err.code !== 'ENOENT') {   // unexpected error
      return done(err);
    }

    // try creating it
    fs.mkdir(bm.dirPath, function (err) {
      if (err) return done(err);
      logger.info('created bookmark dir: ' + bm.dirPath);
      if (done) done(null, 'created ' + bm.dirPath);
    });
  });
};

Bookmark.prototype.save = function(args, done) {
  // args = file, lines, bytes
  var bm = this;
  fs.stat(args.file, function (err, stat) {
    if (err) return done(err);

    var contents = JSON.stringify({
      file:  args.file,
      size:  args.bytes,
      lines: args.lines,
      inode: stat.ino,
    });

    var callDone = function (err) {
      if (err) return done(err);
      logger.info('bookmark.save: line: ' + args.lines);
      done(err);
    };

    var bmPath = path.resolve(bm.dirPath, stat.ino.toString());
    bm.atomicWrite(bmPath, contents, function (err) {
      if (err) {
        // on Debian 7 & node 0.10, occasional write failures have been
        // observed where the file we *just* wrote (w/o err) has no contents
        // or does not exist. Hence the reason to add atomicWrite, and this
        // retry mechanism.
        // pause and retry, once
        var delaySec = Math.floor(Math.random() * 3) + 1;
        setTimeout(function () {
          bm.atomicWrite(bmPath, contents, callDone);
        }, delaySec * 1000);
        return;
      }
      callDone(err);
    });
  });
};

Bookmark.prototype.atomicWrite = function(bmPath, contents, done) {
  var tmpPath = path.resolve(bmPath + '.tmp');
  // write out a tmp file
  fs.writeFile(tmpPath, contents, function (err) {
    if (err) return done(err);

    fs.stat(tmpPath, function (err, stat) {
      if (err) return done(err);

      // verify the JSON string was written
      if (!stat.size || process.env.MOCK_STAT_ERROR === true) {
        logger.error(stat);
        logger.error('stat should have had...');
        logger.error(contents);
        return done(new Error(tmpPath + 'is empty!'));
      }
      // atomically store/replace the bookmark file
      fs.rename(tmpPath, bmPath, done);
    });
  });
};

Bookmark.prototype.read = function(logFilePath, done) {
  var bm = this;

  fs.stat(logFilePath, function (err, stat) {
    if (err) return done(err);

    var bmPath = path.resolve(bm.dirPath, stat.ino.toString());
    fs.readFile(bmPath, function (err, data) {
      if (err) return done(err);
      if (!data) return done('empty bookmark file!');
      var mark = JSON.parse(data);
      if (mark.size > stat.size) {
        logger.info('bookmark.read: old size ' + mark.size + ' > ' + stat.size);
        return done();
      }
      logger.info('bookmark.read: line ' + mark.lines + ' size ' + mark.size);
      return done(err, mark);
    });
  });
};

module.exports = function (options) {
  return new Bookmark(options);
};
