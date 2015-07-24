'use strict';

if (process.env.COVERAGE) require('blanket');

var fs      = require('fs');
var path    = require('path');

function Bookmark (dir, options) {
	// console.log(arguments);
	if (!dir) dir = './.bookmark';

	this.dirPath = path.resolve(dir);

	// if the directory doesn't exist, try to make it
	fs.stat(this.dirPath, function (err, stat) {
		if (!err) return;        // already exists

		if (err.code !== 'ENOENT') {
			console.error(err);  // unexpected error
			return;
		}

		// try creating it
		fs.mkdir(this.dirPath, function (err) {
			if (err) return console.error(err);
			console.log('created bookmark dir: ' + this.dirPath);
		}.bind(this));
	}.bind(this));
	// console.log(this);
}

Bookmark.prototype.save = function (inode, mark, done) {
	mark.inode = inode;
	var filePath = path.resolve(this.dirPath, inode.toString());
	var contents = JSON.stringify(mark);
	fs.writeFile(filePath, contents, done);
};

Bookmark.prototype.read = function (inode, done) {
	var filePath = path.resolve(this.dirPath, inode.toString());
	fs.readFile(filePath, function (err, data) {
		if (err) return done(err);
		var mark = JSON.parse(data);
		return done(err, mark);
	});
};

module.exports = function (options) {
    return new Bookmark(options);
};