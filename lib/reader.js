
if (process.env.COVERAGE) require('blanket');

var events    = require('events');
var fs        = require('fs');
var path      = require('path');
var util      = require('util');
var zlib      = require('zlib');

var bookDir   = path.resolve('./', '.bookmark');
var Bookmark  = require('./bookmark')(bookDir);
var Splitter  = require('./liner');

function Reader (fileOrPath, options) {
    events.EventEmitter.call(this);

    if (!options) options = {};
    this.watchOpts  = { persistent: true, recursive: false };
    this.encoding   = options.encoding || 'utf8';

    this.isArchive  = false;
    this.filePath   = path.resolve(fileOrPath);
    this.lines      = 0;
    this.bytes      = options.bytes || 0;

    fs.stat(this.filePath, function (err, stat) {
        if (err) {
            if (err.code === 'ENOENT') {  // non-existent
                return this.watch(this.filePath);
            }
            return console.error(err);
        }
        this.createStream();
    }.bind(this));
}

util.inherits(Reader, events.EventEmitter);

Reader.prototype.lineSplitter = function () {

    this.liner = new Splitter({ encoding: this.encoding })
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
    this.stream = fs
        .createReadStream(this.filePath, fileOpts)
        .pipe(this.liner);
};

Reader.prototype.watch = function (fileOrDir) {

    this.resolveAncestor(fileOrDir, function (err, existentPath) {
        if (err) {
            return console.error(err);
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
            if (err.code === 'ENOENT') {
                return this.resolveAncestor(path.dirname(filePath), done);
            }
            return done(err);
        }
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

    // log file just reappeared
    if (filename === path.basename(this.filePath)) {
        // console.log('\treading ' + this.filePath);
        setTimeout(function () {
            this.createStream();
        }.bind(this), 100);
        return;
    }

    // log file moved away (foo.log -> foo.log.1)
    this.bytes = 0;
    this.watch(path.dirname(this.filePath));
};

Reader.prototype.end = function () {
    // console.log('end of ' + this.filePath);
    if (this.isArchive) return; // archives don't get appended
    if (this.watcher) return;

    // start watching
    this.watch(this.filePath);
};

module.exports = {
    createReader: function (filePath, options) {
        return new Reader(filePath, options);
    }
};
