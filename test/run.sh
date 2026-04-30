#!/bin/sh

export NODE_ENV="test"
CMD="node --test --test-force-exit"

case "$1" in
  cov|lcov) CMD="$CMD --experimental-test-coverage";;
  lint)
      npm list | grep -q eslint || npm install @eslint/js eslint globals
      npx eslint *.js test/*.js
      exit 0
esac

case "$1" in
  lcov)
    mkdir -p coverage
    CMD="$CMD --test-reporter=lcov --test-reporter-destination=coverage/lcov.info";;
esac

chmod ugo-r ./test/data/test-no-perms.log
chmod ugo-w ./test/data/nowrite
chmod ugo-r ./test/data/noread

echo "$CMD"
$CMD test/*.js

chmod +r ./test/data/noread
chmod +r ./test/data/test-no-perms.log
