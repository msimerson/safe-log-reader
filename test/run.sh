#!/bin/sh

chmod ugo-r ./test/data/test-no-perms.log
chmod ugo-w ./test/data/nowrite
chmod ugo-r ./test/data/noread

NODE_ENV=test npx mocha --exit

# chmod ugo+r ./test/data/noread
