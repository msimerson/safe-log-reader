
var assert  = require('assert');
var child    = require('child_process');
var fs      = require('fs');
var path    = require('path');

var reader  = require('../lib/reader');

var dataDir = path.join('test', 'data');
var logLine = 'The rain in spain falls mainly on the plain.';

describe('reader', function () {
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
        var childOpts  = { env: {
            FILE_PATH: appendFile,
            LOG_LINE: (logLine + '\n'),
        } };

        before(function (done) {
            fs.writeFile(appendFile, 'I will grow\n', function () {
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
                    child.fork(
                        path.join('test','helpers','fileAppend.js'),
                        childOpts
                    )
                    .on('message', function (msg) {
                        appended = true;
                        // console.log(msg);
                    });
                }
                if (appended && linesRead === 2) done();
            })
            .on('readable', function () { this.read(); });
        });        
    });

    context('after file rotation', function () {

        it('reads lines appended to new file', function (done) {
            var isRotated = false;
            var lineCount = 0;
            var appendsSeen = 0;
            var rotateLog = path.join(dataDir, 'rotate.log');
    
            fs.writeFile(rotateLog, logLine + '\n', function () {

                reader.createReader(rotateLog)
                .on('readable', function () { this.read(); })
                .on('read', function (data) {
                    lineCount++;
                    // console.log(lineCount + '. ' + data);

                    var tryDone = function () {
                        if (appendsSeen) return done();
                        setTimeout(function () { tryDone(); }, 10);
                    };

                    if (lineCount === 2) tryDone();
                    if (isRotated) return;

                    var cp = child.fork(
                        path.join('test','helpers','fileRename.js'),
                        { env: {
                            OLD_PATH: rotateLog,
                            NEW_PATH: rotateLog + '.1',
                        } }
                    )
                    .on('message', function (msg) {
                        // console.log(msg);
                        isRotated = true;
                        child.fork(
                            path.join('test','helpers','fileAppend.js'),
                            { env: {
                                FILE_PATH: rotateLog,
                                LOG_LINE: logLine + '\n',
                            } }
                        )
                        .on('message', function (msg) {
                            // console.log(msg);
                            appendsSeen++;
                        });
                    });
                });
            });
        });

        it.skip('reads lines appended to rotated file', function (done) {
            var isRotated = false;
            var lineCount = 0;
            var appendsSeen = 0;
            var rotateLog = path.join(dataDir, 'rotate-old.log');

            fs.writeFile(rotateLog, logLine + '\n', function () {

                reader.createReader(rotateLog)
                .on('readable', function () { this.read(); })
                .on('read', function (data) {
                    lineCount++;
                    console.log(lineCount + '. ' + data);

                    var tryDone = function () {
                        if (appendsSeen) return done();
                        setTimeout(function () { tryDone(); }, 10);
                    };

                    if (lineCount === 2) tryDone();
                    if (isRotated) return;

                    var cp = child.fork(
                        path.join('test','helpers','fileRename.js'),
                        { env: {
                            OLD_PATH: rotateLog,
                            NEW_PATH: rotateLog + '.1',
                        } }
                    )
                    .on('message', function (msg) {
                        // console.log(msg);
                        isRotated = true;
                        child.fork(
                            path.join('test','helpers','fileAppend.js'),
                            { env: {
                                FILE_PATH: rotateLog + '.1',
                                LOG_LINE: logLine + '\n',
                            } }
                        )
                        .on('message', function (msg) {
                            console.log(msg);
                            appendsSeen++;
                        });
                    });
                });
            });
        });
    });

    context('on non-existent file', function () {

        var missingFile = path.join(dataDir, 'missing.log');
        var childOpts  = { env: {
            FILE_PATH: missingFile,
            LOG_LINE: (logLine + '\n'),
        } };

        before(function (done) {
            fs.unlink(missingFile, function (err) {
                // might not exist, ignore err
                done();
            });
        });

        it('discovers and reads', function (done) {

            reader.createReader(missingFile)
            .on('readable', function () { this.read(); })
            .on('read', function (data) {
                assert.equal(data, logLine);
                done();
            });

            process.nextTick(function () {
                child.fork(
                    path.join('test','helpers','fileAppend.js'),
                    childOpts
                )
                .on('message', function (msg) {
                    // console.log(msg);
                });
            });
        });

    });
});
