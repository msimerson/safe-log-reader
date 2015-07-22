
var cluster = require('cluster');
var fs      = require('fs');
var path    = require('path');

var bookmarkFile = '.safe-log-reader.json';
var bookmarks    = loadBookmarks();
var filesToWatch = ['mail.log'];
var filesBeingWatched = {};

// get list of files to watch

if (cluster.isMaster) {

	// spawn a process to watch each file
	while (filesToWatch.length) {
		var fileName = path.resolve(filesToWatch.shift());
		var worker = cluster.fork({FILE_TO_READ: fileName});
		filesBeingWatched[worker.process.pid] = fileName;
	}

	console.log(filesBeingWatched);

	cluster.on('exit', function(worker, code, signal) {
	    console.log('worker ' + worker.process.pid + ' died');
	});

	return;
}

// Set up workers
if (cluster.isWorker) {
	var file = process.env.FILE_TO_READ;
	if (!file) {
		console.error('no file defined!');
		worker.disconnect();
		return;
	}

	fs.stat(file, function (err, stats) {
		if (err) {
			console.error(err.message);
			return;
		}

		// console.log(stats);
		if (!bookmarks[stats.ino]) {
			console.log('new log file, read from start');
			readFile(file, stats.ino, 0);
			return;
		}			

		console.log('found bookmark for ' + file);
		if (stats.size === bookmarks[stats.ino].bytes) {
			console.log('log fully read, watching');
			watchFile(file, stats.ino);
			return;
		}

		var bm = bookmarks[stats.ino];
		console.log('old log file, read from line ' + bm.lines);
		readFile(file, stats.ino);
	});
}

function readFile(fileName, inode) {
	// var fs     = require('fs');
	var bm     = bookmarks[inode];
	var liner  = require('./liner');
	var parser = require('postfix-parser');

	var source = fs.createReadStream(fileName);
	source.pipe(liner);
	var curLines = 0;

	liner.on('readable', function () {
	    var line;
	    while (line = liner.read()) {
	    	curLines++;
	    	if (bm && curLines <= bm.lines) return;
	    	console.log(line);
	    	return;
	    	var r = parser.asObject('syslog', line);
	    	var s = parser.asObject(r.prog, r.msg);
	        // console.log(r); // do something with line
	        console.log(s);
	    }
	});

	liner.on('end', function () {
		bookmarks[inode] = {
			file: fileName,
			bytes: liner.bytes,
			lines: curLines,
		};
		saveBookmarks();
		console.log(bookmarks);
	});
}

function saveBookmarks () {
	fs.writeFile(bookmarkFile, JSON.stringify(bookmarks));
}

function watchFile(fileName) {
	var options = {};
	var watcher = fs.watch(file, options, function (event, filename) {
		console.log('listener callback saw ' + event + ' on ' + filename);
	});
	watcher.on('change', function (event, filename) {
		console.log('watcherOnChange ' + filename + ' saw ' + event + ' event');
	});
	watcher.on('error', function (err) {
		console.log('watcherOnError ' + file + ' saw: ' + err.message);
	});
	console.log('watching: ' + file);
}

function loadBookmarks () {
	var data;
	try {
		data = fs.readFileSync(bookmarkFile, { encoding: 'utf8' });
	}
	catch (e) {
		console.error(e.message);
		return {};
	}
	bookmarks = JSON.parse(data);
	console.log('read bookmarks');
	console.log(bookmarks);
	return bookmarks;
}