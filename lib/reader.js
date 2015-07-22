
var events = require('events');
var fs     = require('fs');
var path   = require('path');
var util   = require('util');
var zlib   = require('zlib');

var Liner  = require('./liner');

function Reader (filePath, options) {
    events.EventEmitter.call(this);

    this.isArchive = false;

    if (/^[^\/]/.test(filePath)) {
        filePath = path.resolve(filePath);
    }

    var gunzip;
    if (/\.gz$/.test(filePath)) {
        this.isArchive = true;
        gunzip = zlib.createGunzip();
    }

    var liner = new Liner();

    if (gunzip) {
        fs.createReadStream(filePath).pipe(gunzip).pipe(liner);
    }
    else {
        fs.createReadStream(filePath).pipe(liner);
    }

    liner.on('readable', function () {
        this.emit('readable');
    }.bind(this));

    this.read = function () {
        var line = liner.read();
        if (!line) return;
        this.emit('read', line);
    }.bind(this);

    liner.on('end', function () {
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
