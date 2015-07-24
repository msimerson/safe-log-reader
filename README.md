[![Build Status][ci-img]][ci-url]
[![Coverage Status][cov-img]][cov-url]

# safe-log-reader

Safe Log Reader

## Features

- [x] Read plain text files
- [ ] Handles common log file events
    - [x] reads growing files (aka: tail -F)
    - [ ] reads rotated log files properly
        - [ ] continues reading old log file until quiet
        - [x] reads the new file when it appears
            - [x] fs.watch tested on:
                - [x] Mac OS X
                - [x] Linux
                - [ ] FreeBSD
    - [ ] file truncation (echo '' > foo.log)
    - [x] watches for non-existent log to appear
- [ ] Read compressed log files
    - [x] gzip (zlib)
    - [ ] bzip2
- [x] Emits data as lines, upon request (paused mode streaming)
- [x] handles utf-8 multibyte characters properly
- [x] streams multiple files simultaneously
    - [ ] one superviser + one child process per log file
- [ ] Remembers previously read files
    - [ ] Perists across program restarts (bookmarks)
        - [ ] identifies files by inode
        - [ ] saves file data: name, size, byte position, line count
- [ ] cronolog style syntax (/var/log/http/201?/??/??/access.log)
    - [ ] watches existing directory ancestor
- [ ] feeds logs to a shipper
    - [ ] log-ship-elastic-postfix
        - receives batches of log entries
        - parses using postfix-parser
        - fetches matching docs from ES
        - updates/creates normalized documents
        - saves docs to elasticsearch
    - [ ] log-ship-elastic-qpsmtpd
        - receives JSON parsed log lines
        - saves to elasticsearch
- [ ] process line status, examples:
    - reader:/var/log/mail.log bytes:5689423 lines:43023 reading
    - reader:/var/log/mail.log.1 bytes:2340953 lines:98302 waiting for data


[ci-img]: https://travis-ci.org/DoubleCheck/safe-log-reader.svg
[ci-url]: https://travis-ci.org/DoubleCheck/safe-log-reader
[cov-img]: https://coveralls.io/repos/DoubleCheck/safe-log-reader/badge.svg
[cov-url]: https://coveralls.io/github/DoubleCheck/safe-log-reader
