'use strict';

// https://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/

var stream = require('stream');

var liner  = new stream.Transform({ objectMode: true });
liner.setEncoding('utf8');

liner.bytes = 0;

liner._transform = function (chunk, encoding, done) {
	liner.bytes = liner.bytes + chunk.length;

    var data = chunk.toString();
    if (this._lastLineData) data = this._lastLineData + data;
 
    var lines = data.split('\n');
    this._lastLineData = lines.splice(lines.length-1,1)[0];

    lines.forEach(this.push.bind(this));
    done();
};
 
liner._flush = function (done) {
    if (this._lastLineData) this.push(this._lastLineData);
    this._lastLineData = null;
    done();
};
 
module.exports = liner;
