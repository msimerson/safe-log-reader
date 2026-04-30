[![Build Status][ci-img]][ci-url]
[![Code Coverage][cov-img]][cov-url]
[![NPM][npm-img]][npm-url]

# Safe Log Reader

Read plain or compressed log files from disk, deliver as [batches of] lines to a log consumer. Wait for the log consumer to report success. Advance bookmark. Repeat ad infinitum.

# Install

```sh
npm i safe-log-reader
```

# Usage

```js
import { createReader } from 'safe-log-reader';
import { resolve } from 'node:path';

createReader(filePath, {
    batchLimit: 1024,
    bookmark: {
        dir: resolve('someDir', '.bookmark'),
    },
})
.on('read', (line, lineNumber) => {
    // process this line of text
})
.on('drain', (done) => {
    // batch complete — call done() to save bookmark and continue reading
    done();
})
.on('end', () => {
    // reached end of file; watching for changes
});
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `bookmark.dir` | `./.bookmark` | Directory to store bookmark files |
| `batchLimit` | `0` (no limit) | Max lines per batch before emitting `drain` |
| `batchDelay` | `0` | Seconds to pause between batches |
| `watchDelay` | `2` | Seconds to wait after a file change before re-reading |
| `noBookmark` | `false` | Skip bookmark read/write (always read from start) |
| `encoding` | `utf8` | File character encoding |

## Events

| Event | Arguments | Description |
|-------|-----------|-------------|
| `read` | `(line, lineNumber)` | One line of text |
| `drain` | `(done)` | Batch limit reached or EOF — call `done(err, delaySeconds)` to save bookmark and resume |
| `end` | — | Reached end of file; watcher is active |
| `irrelevantFile` | `(filename)` | A file changed in the watched directory but it's not the target file |

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
- [x] Emits data as lines (paused mode streaming)
    - [x] Uses a [Transform Stream](https://nodejs.org/api/stream.html#stream_class_stream_transform_1) to efficiently convert buffer streams to lines
    - [x] waits for confirmation, then advances bookmarks
- [x] handles utf-8 multibyte characters properly
- [x] Remembers previously read files (bookmarks)
    - [x] Persists across program restarts
        - [x] identifies files by inode
        - [x] saves file data: name, size, line count, inode
    - [x] When safe, uses byte position to efficiently resume reading
- [ ] winston naming syntax (app.log1, app.log2, etc.)
- [x] zero runtime dependencies

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

# Similar Projects

* [tail-stream](https://github.com/Juul/tail-stream) has good options for
  reading a file and handling rotation, truncation, and resuming. It had no
  tests so I wrote them and most have been merged. Bugs remain unresolved.
  The GPL license was problematic.
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
the byte stream offset the consuming app has committed. When saving bookmarks,
the file position advances to the byte offset coinciding with the byte
position of the last line your application has safely committed.

Safe-log-reader uses a Transform Stream to convert the byte stream into
lines. This makes it dead simple to read compressed files by adding
a `.pipe(ungzip())` into the stream.

<sub>Copyright 2015 by eFolder, Inc.</sub>

[ci-img]: https://github.com/msimerson/safe-log-reader/actions/workflows/test.yml/badge.svg
[ci-url]: https://github.com/msimerson/safe-log-reader/actions/workflows/test.yml
[cov-img]: https://codecov.io/github/msimerson/safe-log-reader/badge.svg
[cov-url]: https://codecov.io/github/msimerson/safe-log-reader
[npm-img]: https://nodei.co/npm/safe-log-reader.png
[npm-url]: https://www.npmjs.com/package/safe-log-reader
