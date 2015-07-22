'use strict';

// https://nodejs.org/api/stream.html#stream_object_mode

var StringDecoder = require('string_decoder').StringDecoder;
var Transform = require('stream').Transform;
var util   = require('util');

function LineSplitter (options) {
    if (!options) options = {};
    if (!options.transform) options.transform = { objectMode: true };
    if (!options.encoding)  options.encoding = 'utf8';

    Transform.call(this, options.transform);

    this.seperator = options.seperator || '\n';
    this._buffer = '';
    this._decoder = new StringDecoder(options.encoding);

    this.bytes = 0;
}

util.inherits(LineSplitter, Transform);

LineSplitter.prototype._transform = function (chunk, encoding, done) {
    this.bytes = this.bytes + chunk.length;

    this._buffer += this._decoder.write(chunk);

    var lines = this._buffer.split(this.seperator);
    this._buffer = lines.pop();

    for (var i = 0; i < lines.length; i++) {
        this.push(lines[i]);
    }
    done();
};

LineSplitter.prototype._flush = function (done) {
    // trailing text (after last seperator)
    this.push(this._buffer.trim());
    done();
};

module.exports = function(options) {
    return new LineSplitter(options);
};