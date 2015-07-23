
var assert  = require('assert');
var path    = require('path');

var bookDir = path.resolve('test','.bookmarks');
var book    = require('../lib/bookmark')(bookDir);

describe('bookmark', function () {

	var inode = "34454366";
	var bm = {
		"file":"/Users/matt/Documents/git/efolder/safe-log-reader/mail.log",
		"bytes":8193,
		"lines":45
	};

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