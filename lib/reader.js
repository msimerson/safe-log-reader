
if (process.env.COVERAGE) require('blanket');

var events    = require('events');
var fs        = require('fs');
var path      = require('path');
var util      = require('util');
var zlib      = require('zlib');

var Bookmark  = require('./bookmark');
var Splitter  = require('./line-splitter');

function Reader (fileOrPath, options) {
    events.EventEmitter.call(this);

    if (!options) options = { bookmark: { } };
    this.watchOpts   = { persistent: true, recursive: false };
    this.encoding    = options.encoding || 'utf8';
    this.noBookmark  = options.noBookmark || false;
    this.bookmark    = new Bookmark(options.bookmark.dir ||
                        path.resolve('./', '.bookmark'));

    this.isArchive   = false;
    this.filePath    = path.resolve(fileOrPath);
    this.bytes       = 0;
    this.lines       = 0;

    if (options.bytes !== undefined) this.bytes = options.bytes;

    // does the log file exist?
    fs.stat(this.filePath, function (err, stat) {
        if (err) {
            if (err.code === 'ENOENT') {  // non-existent
                return this.watch(this.filePath);
            }
            return console.error(err);
        }

        if (this.noBookmark) {    // for testing
            return this.createStream();
        }
        // console.log(stat);
        // load up the bookmark for for it
        this.bookmark.read(stat.ino, function (err, mark) {
            if (err && err.code !== 'ENOENT') {
                console.error(err.message);
            }
            if (!this.bytes && mark && mark.bytes) {
                this.bytes = mark.bytes;
                // console.log('Bookmark bytes: ' + this.bytes);
            }
            this.createStream();
        }.bind(this));
    }.bind(this));
}

util.inherits(Reader, events.EventEmitter);

Reader.prototype.lineSplitter = function () {

    this.liner = new Splitter({
        bytes:    this.bytes,
        encoding: this.encoding,
    })
    .on('readable', function () {
        this.emit('readable');
    }.bind(this))
    .on('end', this.end.bind(this));
};

Reader.prototype.read = function () {
    var line = this.liner.read();
    this.bytes = this.liner.bytes;
    // console.log('\tbytes: ' + this.bytes);
    if (line === null) {  // EOF
        return;
    }
    this.lines++;
    this.emit('read', line, this.lines);
};

Reader.prototype.createStream = function () {

    this.lineSplitter();

    if (/\.gz$/.test(this.filePath)) {
        this.isArchive = true;
        fs.createReadStream(this.filePath)
            .pipe(zlib.createGunzip())
            .pipe(this.liner);
        return;
    }

    if (/\.bz2$/.test(this.filePath)) {
        this.isArchive = true;
        // ick. to use in pipe, compressjs has node-gyp dep. I think I'd
        // rather spawn a child process using CLI bunzip2
        throw('no bzip2 support just yet');
    }

    var fileOpts = {
        start: this.bytes,
        autoClose: true,
        encoding: this.encoding,
    };
    // console.log(fileOpts);

    this.stream = fs.createReadStream(this.filePath, fileOpts)
        .pipe(this.liner);
};

Reader.prototype.watch = function (fileOrDir) {

    this.resolveAncestor(fileOrDir, function (err, existentPath) {
        if (err) {
            console.error(err);
            return;
        }
        this.watcher = fs.watch(existentPath,
            this.watchOpts,
            this.watchEvent.bind(this)
        );
    }.bind(this));
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

Reader.prototype.watchEvent = function (event, filename) {
    // console.log('watcher saw ' + event + ' on ' + filename);
    switch (event) {
        case 'change':
            this.change(filename);
            break;
        case 'rename':
            this.rename(filename);
            break;
    }
};

Reader.prototype.change = function (filename) {
    // we can get multiple of these in rapid succession.
    // ignore subsequent...
    if (!this.watcher) return;

    this.watcher.close();
    this.watcher = null;

    // give the events a chance to settle
    setTimeout(function () {
        this.createStream();
    }.bind(this), 10);
};

Reader.prototype.rename = function (filename) {
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
                this.bytes = 0;
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

    this.bytes = 0;

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

Reader.prototype.end = function () {
    // console.log('end of ' + this.filePath);
    if (this.isArchive) return; // archives don't get appended
    if (this.watcher) return;

    var watchAndEmit = function () {
        this.watch(this.filePath);
        this.emit('end');
    }.bind(this);

    if (this.noBookmark) return watchAndEmit();

    fs.stat(this.filePath, function (err, stat) {

        var mark = {
            file: this.filePath,
            bytes: this.bytes,
            size: stat.size,
            lines: this.lines,
        };
        this.bookmark.save(stat.ino, mark, function (err) {
            if (err) console.error(err);
            watchAndEmit();
        }.bind(this));
    }.bind(this));
};

module.exports = {
    createReader: function (filePath, options) {
        return new Reader(filePath, options);
    }
};
