
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

    this.createStream();
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
        var gunzip = zlib.createGunzip();
        fs.createReadStream(this.filePath)
            .pipe(gunzip)
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

Reader.prototype.watcherCb = function (event, filename) {
    // console.log('watcher saw ' + event + ' on ' + filename);
    switch (event) {
        case 'change':
            if (!this.watcher) return;
            this.watcher.close();
            setTimeout(function () {
                // give the events a chance to settle
                this.createStream();
            }.bind(this), 10);
            break;
        case 'rename':
            this.watcher.close();
            this.moved(filename);
            break;
    }
};

Reader.prototype.moved = function (filename) {
    // console.log('\tmoved: ' + filename);

    switch (process.platform) {
        case 'darwin':
            this.movedMacOS(filename);
            return;
        case 'linux':
            this.movedLinux(filename);
            return;
        default:
            // falls through
    }

    if (!filename) {
        console.error('moved w/o filename: report OS/node combo');
        return;
    }
}

Reader.prototype.movedLinux = function (filename) {
    // we only get the source filename (foo.log), not dest

    // and we don't know what happened (create, delete, move)
    fs.stat(this.filePath, function (err, stats) {
        if (err) {
            if (err.code === 'ENOENT') {  // mv or rm
                this.bytes = 0;
                // watch parent dir for file to reappear
                this.watcher = fs.watch(
                    path.dirname(this.filePath),
                    this.watchOpts,
                    this.watcherCb.bind(this)
                );
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
}

Reader.prototype.movedMacOS = function (filename) {

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
    this.watcher = fs.watch(
        path.dirname(this.filePath),
        this.watchOpts,
        this.watcherCb.bind(this)
    );
};

Reader.prototype.end = function () {
    // console.log('end of ' + this.filePath);
    if (this.isArchive) return; // archives don't get appended
    if (this.watcher) return;

    // start watching?
    this.watcher = fs.watch(
        this.filePath,
        this.watchOpts,
        this.watcherCb.bind(this)
    );
    // console.log('\twatching ' + this.filePath);
};

module.exports = {
    createReader: function (filePath, options) {
        return new Reader(filePath, options);
    }
};
