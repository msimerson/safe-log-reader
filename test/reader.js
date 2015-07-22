
var assert  = require('assert');

var reader  = require('../lib/reader');
var logLine = 'The rain in spain falls mainly on the plain.';

describe('reader', function() {
    it('reads a text file', function (done) {
        reader.createReader('./test/data/test.log')
        .on('read', function (data) {
            assert.equal(data, logLine);
            done();
        })
        .on('readable', function () { this.read(); });
    });

    it('reads a text file', function (done) {
        reader.createReader('./test/data/test.log.1')
        .on('read', function (data) {
            assert.equal(data, logLine);
            done();
        })
        .on('readable', function () { this.read(); });
    });

    it('reads a gzipped file', function (done) {
        reader.createReader('./test/data/test.log.1.gz')
        .on('read', function (data) {
            // console.log(data);
            assert.equal(data, logLine);
            done();
        })
        .on('readable', function () { this.read(); });
    });
});