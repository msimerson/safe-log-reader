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
- [x] handles utf-8 multibyte characters properly
- [x] streams multiple files simultaneously
    - [ ] one superviser + one child process per log file
- [x] Remembers previously read files
    - [x] Perists across program restarts (bookmarks)
        - [x] identifies files by inode
        - [x] saves file data: name, size, byte position, line count
- [ ] cronolog naming syntax (/var/log/http/YYYY/MM/DD/access.log)
    - [ ] watches existing directory ancestor
- [ ] winston naming syntax (app.log1, app.log2, etc.)
- [ ] feeds logs to a shipper
- [ ] process line status, `ps` output examples:
    - reader:/var/log/mail.log bytes:5689423 lines:43023 reading
    - reader:/var/log/mail.log.1 bytes:2340953 lines:98302 waiting for data
- [x] config file is human friendly ini

# Shippers

- [ ] log-ship-elastic-postfix
    - receives batches of log entries
    - parses using [postfix-parser](https://github.com/DoubleCheck/postfix-parser)
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
