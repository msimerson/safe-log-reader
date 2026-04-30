#!/bin/sh

chmod ugo-r ./test/data/test-no-perms.log
chmod ugo-w ./test/data/nowrite
chmod ugo-r ./test/data/noread

NODE_ENV=test node --test --test-force-exit test/bookmark.js test/line-splitter.js test/logger.js test/reader.js

chmod +r ./test/data/noread
chmod +r ./test/data/test-no-perms.log
