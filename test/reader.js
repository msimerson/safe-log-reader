
var assert  = require('assert');
var child   = require('child_process');
var fs      = require('fs');
var path    = require('path');

var readerOpts = { bookmark: {
    dir: path.resolve('test', '.bookmarks')
}};
var noBmReadOpts = JSON.parse(JSON.stringify(readerOpts));
    noBmReadOpts.noBookmark = true;

var reader  = require('../index');

var dataDir = path.join('test', 'data');
var logLine = 'The rain in spain falls mainly on the plain.';

var newFile = function (filePath, data, done) {
    // unlink first, b/c fs.writeFile overwrite doesn't replace the inode
    fs.unlink(filePath, function (err) {
        fs.writeFile(filePath, data, done);
    });
};

describe('reader', function () {

    it('reads a text file', function (done) {
        var filePath = path.join(dataDir, 'test.log');
        
        // console.log(arguments);
        reader.createReader(filePath, noBmReadOpts)
        .on('readable', function () { this.read(); })
        .on('read', function (data) {
            assert.equal(data, logLine);
            done();
        });
    });

    it('reads another text file concurrently', function (done) {
        var linesSeen = 0;
        var filePath = path.join(dataDir, 'test.log.1');
        
        reader.createReader(filePath, noBmReadOpts)
        .on('readable', function () { this.read(); })
        .on('read', function (data, lines, bytes) {
            linesSeen++;
            assert.equal(data, logLine);
            if (linesSeen === 3) done();
        });    
    });

    it('maintains an accurate line counter', function (done) {
        var linesSeen = 0;
        var filePath = path.join(dataDir, 'test.log.1');

        reader.createReader(filePath, noBmReadOpts)
        .on('readable', function () { this.read(); })
        .on('read', function (data, lines, bytes) {
            linesSeen++;
            assert.equal(lines, linesSeen);
            if (linesSeen === 3) done();
        });
    });

    it('reads a gzipped file', function (done) {
        reader.createReader(path.join(dataDir, 'test.log.1.gz'), readerOpts)
        .on('readable', function () { this.read(); })
        .on('read', function (data) {
            // console.log(data);
            assert.equal(data, logLine);
            done();
        });
    });

    it.skip('reads a bzip2 compressed file', function (done) {
        reader.createReader(path.join(dataDir, 'test.log.1.bz2'), readerOpts)
        .on('readable', function () { this.read(); })
        .on('read', function (data) {
            // console.log(data);
            assert.equal(data, logLine);
            done();
        });
    });

    context('growing file', function () {
        var appendFile = path.join(dataDir, 'append.log');
        var childOpts  = { env: {
            FILE_PATH: appendFile,
            LOG_LINE: (logLine + '\n'),
        } };

        before(function (done) {
            fs.appendFile(appendFile, 'I will grow\n', done);
        });

        it('reads lines appended after EOF', function (done) {
            var linesRead = 0;
            var appendCalled = false;
            var appendDone = false;
            var appended = false;

            var tryDone = function () {
                if (appendDone) return done();
                setTimeout(function () { tryDone(); }, 10);
            };

            reader.createReader(appendFile, noBmReadOpts)
            .on('readable', function () { this.read(); })
            .on('read', function (data) {
                linesRead++;
                // console.log('line: ' + linesRead + ', ' + data);
                if (appendDone) tryDone();
            })
            .on('end', function () {

                if (appendCalled) return;
                appendCalled = true;

                // append in a separate process, so this one gets the event
                child.fork(
                    path.join('test','helpers','fileAppend.js'),
                    childOpts
                )
                .on('message', function (msg) {
                    // console.log(msg);
                    appendDone = true;
                });
            });
        });        
    });

    context('after file rotation', function () {

        it('reads lines appended to new file rotate.log', function (done) {
            var lineCount = 0;
            var renameCalled = false;

            var rotateLog = path.join(dataDir, 'rotate.log');
            var appendDone = false;

            var doAppend = function () {
                child.fork(
                    path.join('test','helpers','fileAppend.js'),
                    { env: {
                        FILE_PATH: rotateLog,
                        LOG_LINE: logLine + '\n',
                    } }
                )
                .on('message', function (msg) {
                    // console.log(msg);
                    appendDone = true;
                });
            };

            var tryDone = function () {
                if (appendDone) return done();
                setTimeout(function () { tryDone(); }, 10);
            };
    
            newFile(rotateLog, logLine + '\n', function () {

                reader.createReader(rotateLog, readerOpts)
                .on('readable', function () { this.read(); })
                .on('read', function (data) {
                    lineCount++;
                    // console.log(lineCount + '. ' + data);

                    if (appendDone) tryDone();
                    if (renameCalled) return;
                    renameCalled = true;
                    
                    child.fork(
                        path.join('test','helpers','fileRename.js'),
                        { env: {
                            OLD_PATH: rotateLog,
                            NEW_PATH: rotateLog + '.1',
                        } }
                    )
                    .on('message', function (msg) {
                        // console.log(msg);
                        isRotated = true;
                        doAppend();
                    });
                })
                .on('end', function () {
                    // console.log('end');
                });
            });
        });

        it.skip('reads lines appended to rotated file', function (done) {
            var isRotated = false;
            var lineCount = 0;
            var appendsSeen = 0;
            var rotateLog = path.join(dataDir, 'rotate-old.log');

            fs.writeFile(rotateLog, logLine + '\n', function () {

                reader.createReader(rotateLog, noBmReadOpts)
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

            var appendDone = false;
            var tryDone = function () {
                if (appendDone) return done();
                setTimeout(function () { tryDone(); }, 10);
            };

            reader.createReader(missingFile, noBmReadOpts)
            .on('readable', function () { this.read(); })
            .on('read', function (data) {
                assert.equal(data, logLine);
                tryDone();
            });

            process.nextTick(function () {
                child.fork(
                    path.join('test','helpers','fileAppend.js'),
                    childOpts
                )
                .on('message', function (msg) {                    
                    appendDone = true;
                    // console.log(msg);
                });
            });
        });
    });
});
