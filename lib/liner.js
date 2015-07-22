'use strict';

// https://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/

var stream = require('stream');
var util   = require('util');

function Liner (options) {
    if (!options) options = { objectMode: true };
    stream.Transform.call(this, options);
    this.setEncoding('utf8');

    this.bytes = 0;
    this.lines = 0;

    this._transform = function (chunk, encoding, done) {
        this.bytes = this.bytes + chunk.length;

        var data = chunk.toString();
        if (this._lastLineData) data = this._lastLineData + data;

        var lines = data.split('\n');
        this.lines = this.lines + lines.length;
        this._lastLineData = lines.splice(lines.length-1,1)[0];
        if (!this._lastLineData) this.lines--;

        lines.forEach(this.push.bind(this));
        done();
    }.bind(this);

    this._flush = function (done) {
        if (this._lastLineData) this.push(this._lastLineData);
        this._lastLineData = null;
        done();
    };
}

util.inherits(Liner, stream.Transform);

module.exports = function(options) {
    return new Liner(options);
};
