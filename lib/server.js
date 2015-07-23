
if (process.env.COVERAGE) require('blanket');

var cluster = require('cluster');
var fs      = require('fs');
var path    = require('path');

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

	cluster.on('exit', function (worker, code, signal) {
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
}

function readFile(fileName, inode) {
	var parser = require('postfix-parser');

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
}
