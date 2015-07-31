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

Bookmark.prototype.save = function(logFilePath, lines, done) {
	var bm = this;
    fs.stat(logFilePath, function (err, stat) {
        if (err) return done(err);

        var contents = JSON.stringify({
            file: logFilePath,
            size: stat.size,
            lines: lines,
            inode: stat.ino,
        });

		var bmPath = path.resolve(bm.dirPath, stat.ino.toString());
        fs.writeFile(bmPath, contents, done);
    });
};

Bookmark.prototype.read = function(logFilePath, done) {
	var bm = this;

    fs.stat(logFilePath, function (err, stat) {
        if (err) return done(err);

        var bmPath = path.resolve(bm.dirPath, stat.ino.toString());
        fs.readFile(bmPath, function (err, data) {
			if (err) return done(err);
			if (!data) return done('empty bookmark file!');
			return done(err, JSON.parse(data));
        });
    });
};

module.exports = function (options) {
    return new Bookmark(options);
};