[![Build Status][ci-img]][ci-url]
[![Coverage Status][cov-img]][cov-url]

# safe-log-reader

Safe Log Reader

## Features

- [x] Read plain text files
- [x] Read compressed gz files (zlib)
- [ ] Read compressed bz2 files
- [x] streams multiple files simultaneously
    - [ ] uses cluster, one superviser + one process per log file
- [x] Emits data as lines, upon request (paused mode)
- [x] handles utf-8 multibyte characters properly
- [x] Remembers previously read files and does not repeat
    - [ ] Perists across program restarts (bookmarks)
- [x] reads growing files (aka: tail -F)
- [ ] reads rotated log files properly
    - [ ] continues reading old log file until quiet
    - [x] reads the new file when it appears



[ci-img]: https://travis-ci.org/DoubleCheck/safe-log-reader.svg
[ci-url]: https://travis-ci.org/DoubleCheck/safe-log-reader
[cov-img]: https://coveralls.io/repos/DoubleCheck/safe-log-reader/badge.svg
[cov-url]: https://coveralls.io/github/DoubleCheck/safe-log-reader
