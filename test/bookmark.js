
var assert  = require('assert');
var fs      = require('fs');
var path    = require('path');

var bookDir = path.resolve('test','.bookmarks');
var book    = require('../lib/bookmark')(bookDir);

describe('bookmark', function () {

	var inode = 34454366;
	var bm = {
		'file':'/Users/matt/Documents/git/efolder/safe-log-reader/mail.log',
		'bytes':8193,
		'lines':45
	};

    before('creates bookmark dir', function (done) {
        fs.mkdir(bookDir, function (err) {
            // ignore any 'already exists' error
            done();
        });
    });
/*
    after('cleans bookmark dir', function (done) {
        fs.readdir(bookDir, function (err, files) {
            if (err) return console.error(err);
            for (var i=0; i<files.length; i++) {
                fs.unlink(path.resolve(bookDir, files[i]));
            }
            done();
        });
    });
*/
	it('saves a bookmark', function (done) {
		book.save(inode, bm, function (err) {
			assert.ifError(err);
			done();
		});
	});

	it('reads a bookmark', function (done) {
		book.read(inode, function (err, mark) {
			assert.ifError(err);
			assert.deepEqual(bm, mark);
			done();
		});
	});
});
