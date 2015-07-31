'use strict';

if (process.env.COVERAGE) require('blanket');

var events    = require('events');
var fs        = require('fs');
var path      = require('path');
var util      = require('util');
var zlib      = require('zlib');

var Bookmark  = require('./lib/bookmark');
var Splitter  = require('./lib/line-splitter');

function Reader (fileOrPath, options) {
    events.EventEmitter.call(this);

    if (!options) options = { bookmark: { } };
    this.watchOpts    = { persistent: true, recursive: false };
    this.encoding     = options.encoding || 'utf8';
    this.noBookmark   = options.noBookmark || false;
    this.bookmark     = new Bookmark(options.bookmark.dir ||
                        path.resolve('./', '.bookmark'));
    this.isArchive    = false;
    this.filePath     = path.resolve(fileOrPath);
    this.lines        = { start: 0, position: 0, skip: 0 };
    this.batch        = { count: 0, limit: 0 };
    this.sawEndOfFile = false;
    this.startBytes   = 0;

    if (options.batchLimit) this.batch.limit = options.batchLimit;

    this.startReader();
}

util.inherits(Reader, events.EventEmitter);

Reader.prototype.startReader = function() {
    var slr = this;

    // does the log file exist?
    fs.stat(slr.filePath, function (err, stat) {
        if (err) {
            if (err.code === 'ENOENT') {        // non-existent
                return slr.watch(slr.filePath); // watch for it to appear
            }
            return console.error(err);
        }

        if (slr.noBookmark) {                   // for testing
            // console.log('noBookmark set');
            return slr.createStream();
        }

        slr.bookmark.read(slr.filePath, function (err, mark) {
            if (err && err.code !== 'ENOENT') {
                console.error('trying to read bookmark:');
                console.error(err.message);
                return;
            }

            if (!mark) return slr.createStream();  // no bookmark

            if (mark.lines) {
                // console.log('setting lines.start to: ' + mark.lines);
                slr.lines.start = mark.lines;
            }

            if (mark.size) slr.startBytes = mark.size;

            slr.createStream();  // a Transform stream
        });
    });
};

Reader.prototype.endStream = function () {
    var slr = this;
    // console.log('end of ' + this.filePath);

    this.sawEndOfFile = true;

    if (slr.watcher) {
        console.log(slr.filePath + ' already being watched');
        return;
    }

    var notifyAndWatch = function () {
        slr.emit('end');
        slr.watch(slr.filePath);
    };

    if (slr.noBookmark) return notifyAndWatch();

    slr.bookmark.save(slr.filePath, slr.lines.position, function (err) {
        if (err) {
            console.error(err);
            console.error('unable to save bookmark, refusing to continue');
            return;
        }
        notifyAndWatch();
    });
};

Reader.prototype.readStream = function () {
    var slr = this;

    if (this.alreadyRead()) return;
    if (this.batchIsFull()) return;

    var line = slr.liner.read();
    if (line === null) {              // EOF
        this.sawEndOfFile = true;
        return;
    }

    slr.batch.count++;
    slr.lines.position++;
    slr.emit('read', line, slr.lines.position);
    if (slr.liner.readable) slr.readStream();
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
        // console.log('skipped ' + slr.lines.skip + ' lines');
        slr.lines.skip = 0;
    }

    return false;
};

Reader.prototype.batchIsFull = function() {
    if (!this.batch.limit) return;
    if (this.batch.count < this.batch.limit) return;

    console.log('batchlimit: ' + this.batch.count);
    var slr = this;

    slr.emit('end', function () {
        slr.bookmark.save(slr.filePath, slr.lines.position, function (err) {
            if (err) {
                console.error(err);
                console.error('bookmark save failed, halting');
                return;
            }
            slr.batch.count = 0;
            slr.readStream();
        });
    });
    return true;
};

Reader.prototype.createStream = function () {

    // entered when:
    //     new startup
    //     after EOF, when fs.watch saw a change
    //
    // with transform streams, files/archives are closed for us
    // automatically at EOF. Resetting the line position upon
    // open.
    this.lines.position = 0;

    // the previous splitter is gone after EOF, start a new one
    this.lineSplitter();

    if (/\.gz$/.test( this.filePath)) return this.createStreamGzip();
    if (/\.bz2$/.test(this.filePath)) return this.createStreamBz2();

    var fileOpts = {
        autoClose: true,
        encoding: this.encoding,
    };

    if (this.sawEndOfFile && this.startBytes) {
        // the only time this is safe is when we've read to EOF. Otherwise,
        // the byte position contains buffered data that hasn't been
        // emitted as lines.

        // the alternative to 'start' here, is splitting the entire file
        // into lines (again) and counting lines. Avoid that when possible.
        fileOpts.start = this.startBytes;  // read from bookmark
        this.sawEndOfFile = false;
        this.startBytes = 0;
    }

    fs.createReadStream(this.filePath, fileOpts).pipe(this.liner);
};

Reader.prototype.createStreamGzip = function() {
    this.isArchive = true;

    fs.createReadStream(this.filePath)
        .pipe(zlib.createGunzip())
        .pipe(this.liner);
};

Reader.prototype.createStreamBz2 = function() {
    this.isArchive = true;

    // ick. to use in pipe, compressjs has a node-gyp dep. I think I'd
    // rather spawn a child process using CLI bunzip2. TODO
    throw('no bzip2 support yet');
};

Reader.prototype.lineSplitter = function () {
    var slr = this;

    this.liner = new Splitter({
        encoding: this.encoding,   // for archives
    })
    .on('readable', function () {
        this.emit('readable');
    }.bind(this))
    .on('end', slr.endStream.bind(slr));
};

Reader.prototype.resolveAncestor = function (filePath, done) {
    // walk up a directory tree until an existing one is found
    fs.stat(filePath, function (err, stat) {
        if (err) {
            // console.log('resolveAncestor: ' + err.code);
            if (err.code === 'ENOENT') {
                return this.resolveAncestor(path.dirname(filePath), done);
            }
            return done(err);
        }
        // console.log('\tresolveAncestor: ' + filePath);
        done(null, filePath);
    }.bind(this));
};

Reader.prototype.watch = function (fileOrDir) {
    var slr = this;
    // archives don't get appended, don't watch
    if (slr.isArchive) return;

    slr.resolveAncestor(fileOrDir, function (err, existentPath) {
        if (err) return console.error(err);

        slr.watcher = fs.watch(
            existentPath,
            slr.watchOpts,
            slr.watchEvent.bind(slr)
        );
    });
};

Reader.prototype.watchEvent = function (event, filename) {
    // console.log('watcher saw ' + event + ' on ' + filename);
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
    setTimeout(function () { slr.createStream(); }, 100);
};

Reader.prototype.watchRename = function (filename) {
    // console.log('\trename: ' + filename);
    this.watcher.close();
    this.watcher = null;

    switch (process.platform) {
        case 'darwin':
            this.renameMacOS(filename);
            return;
        case 'linux':
            this.renameLinux(filename);
            return;
        default:
            // falls through
            console.error('report this as GitHub Issue:\n' +
                '\trename: ' + filename + ' on ' + process.platform
            );
    }
};

Reader.prototype.renameLinux = function (filename) {
    // we only get the source filename (foo.log), not dest

    // and we don't know what happened (create, delete, move)
    fs.stat(this.filePath, function (err, stats) {
        if (err) {
            if (err.code === 'ENOENT') {  // mv or rm
                this.lines.start = 0;
                this.lines.position = 0;
                // watch parent dir for file to reappear
                this.watch(path.dirname(this.filePath));
                return;
            }
            console.error(err);
        }

        // console.log(stats);
        // console.log('\treading ' + this.filePath);
        setTimeout(function () {
            this.createStream();
        }.bind(this), 100);
    }.bind(this));
};

Reader.prototype.renameMacOS = function (filename) {

    this.lines.start = 0;
    this.lines.position = 0;

    // log file just (re)appeared
    if (filename === path.basename(this.filePath)) {
        // console.log('\treading ' + this.filePath);
        setTimeout(function () {
            this.createStream();
        }.bind(this), 100);
        return;
    }

    // log file moved away (foo.log -> foo.log.1)
    this.watch(path.dirname(this.filePath));
};

module.exports = {
    createReader: function (filePath, options) {
        return new Reader(filePath, options);
    }
};
