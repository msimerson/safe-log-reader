'use strict';

var fs      = require('fs');
var path    = require('path');

function Bookmark (dir, options) {
	if (!dir) dir = './.bookmark';

	this.dirPath = path.resolve(dir);

	// console.log(this);
}

Bookmark.prototype.save = function (inode, mark, done) {
	fs.writeFile(
		path.resolve(this.dirPath, inode),
		JSON.stringify(mark),
		done
	);
}

Bookmark.prototype.read = function (inode, done) {
	var filePath = path.resolve(this.dirPath, inode);
	fs.readFile(filePath, function (err, data) {
		if (err) return done(err);
		var mark = JSON.parse(data);
		return done(err, mark);
	});
}

module.exports = function (options) {
    return new Bookmark(options);
};