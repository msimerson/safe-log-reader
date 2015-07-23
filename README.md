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
