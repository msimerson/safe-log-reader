[![Build Status][ci-img]][ci-url]
[![Code Coverage][cov-img]][cov-url]
[![Code Climate][clim-img]][clim-url]
[![NPM][npm-img]][npm-url]

# Safe Log Reader

Read plain or compressed log files from disk, deliver as [batches of] lines to a log consumer. Wait for the log consumer to report success. Advance bookmark. Repeat ad infinitum.

# Install

    npm i safe-log-reader

# Usage

````js
var read = require('safe-line-reader');
read.createReader(filePath, {
    batchLimit: 1024,
    bookmark: {
        dir: path.resolve('someDir', '.bookmark'),
    }
})
.on('readable', function () { this.readLine(); })
.on('read', function (line, count) {
    // do something with this line of text
})
.on('end', function (done) {
    // close up shop and go home
});
````

## Features

- [x] Read plain text files
- [x] Handles common log file events
    - [x] reads growing files (aka: tail -F)
    - [x] reads rotated logs
        - [x] reads the new file when it appears
            - [x] fs.watch tested on:
                - [x] Mac OS X
                - [x] Linux
                - [x] FreeBSD
        - [ ] continues reading old log file until quiet
    - [ ] file truncation (echo '' > foo.log)
    - [x] watches for non-existent log to appear
- [x] Read compressed log files
    - [x] gzip (zlib)
    - [ ] bzip2
- [x] Emits data as lines, upon request (paused mode streaming)
    - [x] Uses a [Transform Stream](https://nodejs.org/api/stream.html#stream_class_stream_transform_1) to efficiently convert buffer streams to lines
    - [x] waits for confirmation, then advances bookmarks
- [x] handles utf-8 multibyte characters properly
- [x] Remembers previously read files (bookmarks)
    - [x] Perists across program restarts
        - [x] identifies files by inode
        - [x] saves file data: name, size, line count, inode
    - [x] When safe, uses byte position to efficiently resume reading
- [ ] cronolog naming syntax (/var/log/http/YYYY/MM/DD/access.log)
    - [ ] watches existing directory ancestor
- [ ] winston naming syntax (app.log1, app.log2, etc.)
- [x] zero dependencies

# Shippers

- [x] [log-ship-elastic-postfix](https://github.com/msimerson/log-ship-elastic-postfix)
    - reads batches of log entries
    - parses with [postfix-parser](https://github.com/msimerson/postfix-parser)
    - fetches matching docs from ES
    - updates/creates normalized postfix docs
    - saves docs to elasticsearch
- [x] [log-ship-elastic-qpsmtpd](https://github.com/msimerson/log-ship-elastic-qpsmtpd)
    - receives JSON parsed log lines
    - saves to elasticsearch
- [ ] log-ship-elastic-lighttpd
    - receives JSON parsed log lines
    - saves to elasticsearch

# Similar Projects

* [tail-stream](https://github.com/Juul/tail-stream) has good options for
  reading a file and handling rotation, truncation, and resuming. It had no
  tests so I wrote them and most have been merged. Bugs remain
  (demonstrated with Travis-CI test integration) unresolved. The author
  offered a license in exchange for the tests but the GPL is problematic.
* [tail-forever](https://github.com/mingqi/tail-forever) has character
  encoding detection and very basic file watching.
* [always-tail](https://github.com/jandre/always-tail)

The key "missing" feature of the node "tail" libraries is the ability to
resume correctly after the app has stopped reading (think: kill -9)
in the middle of a file.

Because files are read as [chunks of] bytes and log entries are lines,
resuming at the files last byte position is likely to be in the middle of a
line, or even splitting a multi-byte character. Extra buffered bytes not yet
emitted as lines are lost, unless at restart, one rewinds and replays the
last full $bufferSize. Then the consuming app needs to have duplicate line
detection and suppression.

The key to resuming reading a log file _safely_ is tracking line numbers and
the byte steam offset the consuming app has committed. When saving bookmarks,
the file position advances to the byte offset coinciding with the byte
position of the last line your application has safely commited.

Safe-log-reader uses a Transform Stream to convert the byte stream into
lines. This makes it dead simple to read compressed files by adding
a `.pipe(ungzip())` into the stream.


<sub>Copyright 2015 by eFolder, Inc.</sub>


[ci-img]: https://travis-ci.org/msimerson/safe-log-reader.svg
[ci-url]: https://travis-ci.org/msimerson/safe-log-reader
[cov-img]: https://codecov.io/github/msimerson/safe-log-reader/badge.svg
[cov-url]: https://codecov.io/github/msimerson/safe-log-reader
[clim-img]: https://codeclimate.com/github/msimerson/safe-log-reader/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/msimerson/safe-log-reader
[npm-img]: https://nodei.co/npm/safe-log-reader.png
[npm-url]: https://www.npmjs.com/package/safe-log-reader
