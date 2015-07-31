
var assert  = require('assert');
var fs      = require('fs');
var path    = require('path');

var bookDir = path.resolve('test','.bookmarks');
var book    = require('../lib/bookmark')(bookDir);

describe('bookmark', function () {

	var testFile = path.resolve('./test', 'data', 'test.log');

	it('saves a bookmark', function (done) {
		book.save(testFile, 45, function (err) {
			assert.ifError(err);
			done();
		});
	});

	it('reads a bookmark', function (done) {
		book.read(testFile, function (err, mark) {
			assert.ifError(err);
			assert.equal(mark.lines, 45);
			done();
		});
	});
});
