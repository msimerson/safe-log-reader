[![Build Status][ci-img]][ci-url]
[![Coverage Status][cov-img]][cov-url]

# Safe Log Reader

Read plain or compressed log files from disk. Deliver batches of log lines to a shipper and wait for the shipper to verify delivery. Repeat ad infinitum.

## Install

    npm i safe-log-reader

## Features

- [x] Read plain text files
- [x] Handles common log file events
    - [x] reads growing files (aka: tail -F)
    - [x] reads rotated logs
        - [ ] continues reading old log file until quiet (necessary?)
        - [x] reads the new file when it appears
            - [x] fs.watch tested on:
                - [x] Mac OS X
                - [x] Linux
                - [ ] FreeBSD
    - [ ] file truncation (echo '' > foo.log)
    - [x] watches for non-existent log to appear
- [x] Read compressed log files
    - [x] gzip (zlib)
    - [ ] bzip2
- [x] Emits data as lines, upon request (paused mode streaming)
    - [ ] waits for confirmation, then advances bookmarks
- [x] handles utf-8 multibyte characters properly
- [x] Remembers previously read files (bookmarks)
    - [x] Perists across program restarts
        - [x] identifies files by inode
        - [x] saves file data: name, size, byte position, line count
- [ ] cronolog naming syntax (/var/log/http/YYYY/MM/DD/access.log)
    - [ ] watches existing directory ancestor
- [ ] winston naming syntax (app.log1, app.log2, etc.)
- [x] zero dependencies

# Shippers

- [x] [log-ship-elastic-postfix](https://github.com/DoubleCheck/log-ship-elasticsearch-postfix)
    - reads batches of log entries
    - parses with [postfix-parser](https://github.com/DoubleCheck/postfix-parser)
    - fetches matching docs from ES
    - updates/creates normalized documents
    - saves docs to elasticsearch
- [ ] log-ship-elastic-qpsmtpd
    - receives JSON parsed log lines
    - saves to elasticsearch
- [ ] log-ship-elastic-lighttpd
    - receives JSON parsed log lines
    - saves to elasticsearch


[ci-img]: https://travis-ci.org/DoubleCheck/safe-log-reader.svg
[ci-url]: https://travis-ci.org/DoubleCheck/safe-log-reader
[cov-img]: https://coveralls.io/repos/DoubleCheck/safe-log-reader/badge.svg
[cov-url]: https://coveralls.io/github/DoubleCheck/safe-log-reader
