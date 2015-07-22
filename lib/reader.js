

var fs     = require('fs');
var liner  = require('./liner');
var parser = require('postfix-parser');

var source = fs.createReadStream('./mail.log');

source.pipe(liner);

liner.on('readable', function () {
    var line;
    while (line = liner.read()) {
    	var r = parser.asObject('syslog', line);
    	var s = parser.asObject(r.prog, r.msg);
        // console.log(r); // do something with line
        console.log(s);
    }
});

liner.on('end', function () {
	console.log('bytes: ' + liner.bytes);
    console.log('lines: ' + liner.lines);
});