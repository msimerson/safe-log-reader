'use strict';

const fs      = require('fs');
const path    = require('path');

const logger  = require('./logger');

class Bookmark {

  constructor (dir, options) {
    // logger.info(arguments);
    if (!dir) dir = './.bookmark';

    this.dirPath = path.resolve(dir);

    // if the directory doesn't exist, try to make it
    this.createDir(() => {
      logger.debug(this);
    })
  }

  createDir (done) {

    fs.stat(this.dirPath, (err, stat) => {
      if (!err) return done(err);    // already exists

      if (err.code !== 'ENOENT') {   // unexpected error
        return done(err);
      }

      // try creating it
      fs.mkdir(this.dirPath, (err) => {
        if (err) return done(err);
        logger.info(`created bookmark dir: ${this.dirPath}`);
        if (done) done(null, `created ${this.dirPath}`);
      })
    })
  }

  save (args, done) {
    // args = file, lines, bytes
    fs.stat(args.file, (err, stat) => {
      if (err) return done(err);

      const contents = JSON.stringify({
        file:  args.file,
        size:  args.bytes,
        lines: args.lines,
        inode: stat.ino,
      });

      function callDone (err) {
        if (err) return done(err);
        logger.info(`bookmark.save: line: ${args.lines}`);
        done(err);
      }

      const bmPath = path.resolve(this.dirPath, stat.ino.toString());
      this.atomicWrite(bmPath, contents, (err) => {
        if (err) {
          // on Debian 7 & node 0.10, occasional write failures have been
          // observed where the file we *just* wrote (w/o err) has no contents
          // or does not exist. Hence the reason to add atomicWrite, and this
          // retry mechanism.
          // pause and retry, once
          const delaySec = Math.floor(Math.random() * 3) + 1;
          setTimeout(() => {
            this.atomicWrite(bmPath, contents, callDone);
          }, delaySec * 1000);
          return;
        }
        callDone(err);
      })
    })
  }

  atomicWrite (bmPath, contents, done) {
    const tmpPath = path.resolve(`${bmPath}.tmp`);

    // write out a tmp file
    fs.writeFile(tmpPath, contents, (err) => {
      if (err) return done(err);

      fs.stat(tmpPath, (err, stat) => {
        if (err) return done(err);

        // verify the JSON string was written
        if (!stat.size || process.env.MOCK_STAT_ERROR === true) {
          logger.error(stat);
          logger.error('stat should have had...');
          logger.error(contents);
          return done(new Error(`${tmpPath} is empty!`));
        }
        // atomically store/replace the bookmark file
        fs.rename(tmpPath, bmPath, done);
      })
    })
  }

  read (logFilePath, done) {

    fs.stat(logFilePath, (err, stat) => {
      if (err) return done(err);

      const bmPath = path.resolve(this.dirPath, stat.ino.toString());
      fs.readFile(bmPath, (err, data) => {
        if (err) return done(err);
        if (!data) return done('empty bookmark file!');

        const mark = JSON.parse(data);
        if (mark.size > stat.size) {
          logger.info('bookmark.read: old size ' + mark.size + ' > ' + stat.size);
          return done();
        }
        logger.info('bookmark.read: line ' + mark.lines + ' size ' + mark.size);
        done(err, mark);
      })
    })
  }
}

module.exports = function (options) {
  return new Bookmark(options);
}
