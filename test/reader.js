
var assert  = require('assert');
var child    = require('child_process');
var fs      = require('fs');
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

    it('reads another text file concurrently', function (done) {
        var linesSeen = 0;
        reader.createReader(path.join(dataDir, 'test.log.1'))
        .on('read', function (data, lines, bytes) {
            linesSeen++;
            assert.equal(data, logLine);
            if (linesSeen === 3) done();
        })
        .on('readable', function () { this.read(); });
    });

    it('maintains an accurate line counter', function (done) {
        var linesSeen = 0;
        reader.createReader(path.join(dataDir, 'test.log.1'))
        .on('read', function (data, lines, bytes) {
            linesSeen++;
            assert.equal(lines, linesSeen);
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

    it.skip('reads a bzip2 compressed file', function (done) {
        reader.createReader(path.join(dataDir, 'test.log.1.bz2'))
        .on('read', function (data) {
            // console.log(data);
            assert.equal(data, logLine);
            done();
        })
        .on('readable', function () { this.read(); });
    });

    context('growing file', function () {
        var appendFile = path.join(dataDir, 'append.log');
        var childPath  = path.join('test','helpers','fileAppend.js');
        var childOpts  = { env: {
            FILE_PATH: appendFile,
            LOG_LINE: (logLine + '\n'),
        } };

        before(function (done) {
            fs.writeFile(appendFile, 'I will grow\n', function() {
                done();
            });
        });

        it('reads lines appended after EOF', function (done) {
            var linesRead = 0;
            var appended = false;

            reader.createReader(appendFile)
            .on('read', function (data) {
                linesRead++;
                // console.log('line: ' + linesRead + ', ' + data);
                if (!appended && linesRead === 1) {
                    // append in a separate process, so this one gets the event
                    cp = child.fork(childPath, childOpts)
                    .on('message', function (msg) {
                        appended = true;
                        // console.log(msg);
                    });
                }
                if (appended && linesRead === 2) done();
            })
            .on('readable', function () {
                this.read();
            });
        });        
    });
});
