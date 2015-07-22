
var events = require('events');
var fs     = require('fs');
var path   = require('path');
var util   = require('util');
var zlib   = require('zlib');

var Liner  = require('./liner');

function Reader (filePath, options) {
    events.EventEmitter.call(this);

    this.isArchive = false;
    this.filePath  = path.resolve(filePath);

    var liner = new Liner();  // split stream to lines

    if (/\.gz$/.test(this.filePath)) {
        this.isArchive = true;
        var gunzip = zlib.createGunzip();
        fs.createReadStream(this.filePath).pipe(gunzip).pipe(liner);
    }
    else {
        fs.createReadStream(this.filePath).pipe(liner);
    }

    liner.on('readable', function () {
        this.emit('readable');
    }.bind(this));

    this.read = function () {
        var line = liner.read();
        if (!line) return;
        this.emit('read', line, liner.lines, liner.bytes);
    }.bind(this);

    liner.on('end', function () {
        if (this.isArchive) return; // archives don't get appended

        // start watching
        // console.log('bytes: ' + liner.bytes);
        // console.log('lines: ' + liner.lines);
    });
}

util.inherits(Reader, events.EventEmitter);

module.exports = {
    createReader: function (filePath, options) {
        return new Reader(filePath, options);
    }
};
