
var assert  = require('assert');
var path    = require('path');

var reader  = require('../lib/reader');

var dataDir = path.join('test', 'data');
var logLine = 'The rain in spain falls mainly on the plain.';

describe('reader', function() {
    it('reads a text file', function (done) {
        reader.createReader(path.join(dataDir, 'test.log'))
        .on('read', function (data) {
            assert.equal(data, logLine);
            done();
        })
        .on('readable', function () { this.read(); });
    });

    it('reads a text file', function (done) {
        var linesSeen = 0;
        reader.createReader(path.join(dataDir, 'test.log.1'))
        .on('read', function (data, lines, bytes) {
            assert.equal(data, logLine);
            linesSeen++;
            if (linesSeen === 3) done();
        })
        .on('readable', function () { this.read(); });
    });

    it('reads a gzipped file', function (done) {
        reader.createReader(path.join(dataDir, 'test.log.1.gz'))
        .on('read', function (data) {
            // console.log(data);
            assert.equal(data, logLine);
            done();
        })
        .on('readable', function () { this.read(); });
    });
});

describe('reader', function () {
    it.skip('reads lined appended after EOF', function (done) {
        reader.createReader('./test/data/test.log')
        .on('read', function (data) {
            // body...
        })
        .on('readable', function () {
            console.log('is readable');
        });
    });
});