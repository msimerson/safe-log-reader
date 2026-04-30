# Copilot Instructions for safe-log-reader

## Project Overview

**safe-log-reader** is a Node.js library for reliably reading log files with automatic resumption at safe positions. It handles file rotation, compressed archives (gzip), and multi-byte UTF-8 characters. The key innovation is the bookmark system that persists reading position by inode + line number, enabling safe recovery after interruptions without duplicate or skipped lines.

## Build, Test, and Lint

### Running Tests
```bash
npm run test              # Full test suite (with file permission setup via test/run.sh)
npm run test:coverage    # Test with coverage reporting
npm run test:coverage:lcov  # Generate LCOV coverage report
```

Test environment variables:
- `NODE_ENV=test` suppresses logger output for cleaner test runs
- `DEBUG=true` enables debug logging
- Bookmark tests use `test/.bookmarks` directory

### Linting
```bash
npm run lint             # Run ESLint on all *.js and test/*.js files
```

### No Build Step
This is a library with zero dependencies. No build process required.

## Architecture

### Core Components

**index.js (Reader class)**
- Main export: `createReader(filePath, options)` returns an EventEmitter
- Manages file watching, stream creation, and event coordination
- Lifecycle: stat file → create stream → pipe through LineSplitter → emit 'read' events → save bookmark on success

**lib/bookmark.js**
- Persists reading position as JSON keyed by file inode
- Stores: file path, byte offset, line count, inode
- Atomic writes via temp file + rename to prevent corruption
- Safe byte offsets only saved when EOF reached (otherwise buffered data may be lost)

**lib/line-splitter.js (Transform Stream)**
- Converts raw byte chunks to line strings
- Handles multi-byte UTF-8 characters correctly via StringDecoder
- Emits one line per push()
- Buffers incomplete lines until separator found

**lib/logger.js**
- Stub logging for extensibility (meant to be overridden with Winston, log4js, etc.)
- Respects: `DEBUG` env var, `NODE_ENV=test` silences output

### Event Flow
1. **'readable'** event fires when data available from stream
   - **Important**: In Node 22+, this may fire multiple times with buffered data
   - Must loop `while (this.readLine())` to consume all available data (see memory note)
2. **'read'** event emitted per line (custom event on Reader)
3. Consumer processes line, calls `readLine()` when ready (paused mode)
4. On success, consumer may call `saveBookmark()` to persist position
5. **'end'** event when stream exhausted

### Bookmark Safety Model
- **Problem**: Reading stops mid-file at arbitrary byte position, possibly mid-line or mid-UTF8-character
- **Solution**: Track line numbers, save byte offsets only when EOF reached, use inodes to detect file rotation
- **Resume**: Rewind by `bookmarkBuffer` (unused buffered bytes) to replay, dedup lines in consumer
- When file rotates (inode changes), new bookmark starts fresh

## Coding Conventions

### Style & Patterns
- CommonJS modules (`require`/`module.exports`)
- Event-driven via EventEmitter
- Streams-based I/O (Transform streams, pipe chains)
- Async callbacks or EventEmitter pattern (no promises/async-await)
- Single quotes for strings
- Always start files with `'use strict';`

### Variable Naming
- `filePath` for resolved absolute paths
- `linePath` for bookmark files
- `bytesOffset` / `lines.position` for tracking progress
- `liner` for the Transform stream instance
- `mark` for bookmark objects

### Error Handling
- Errors passed to callbacks (Node.js callback convention)
- Tests use assert for simple comparisons
- Environment variables for test/debug modes, not command-line args

### File Permissions in Tests
Test setup handles special permissions:
```bash
chmod ugo-r ./test/data/test-no-perms.log  # Unreadable file
chmod ugo-w ./test/data/nowrite            # Unwritable dir
chmod ugo-r ./test/data/noread             # Unreadable dir
```

## Important Notes

### Node 22+ Readable Event Behavior
In Node 22+, the `'readable'` event on Transform streams may fire multiple times while buffering data. The reader must loop through `readLine()` calls until it returns falsy:
```js
.on('readable', () => {
  while (this.readLine()) {
    // readLine returns true or 'skipping' to continue,
    // false (falsy) to stop
  }
})
```

### Bookmark Directory Setup
Options can specify custom bookmark dir:
```js
const opts = {
  bookmark: { dir: path.resolve('custom', '.bookmarks') }
};
```
If not specified, defaults to `./.bookmark` in working directory.

### Supporting Compressed Files
Gzip archives are automatically detected by `.gz` extension:
```js
fs.createReadStream(filePath).pipe(zlib.createGunzip()).pipe(this.liner);
```
Bzip2 support is not implemented (noted in code as TODO using bunzip2 CLI).

### Testing Permissions
Before running tests, `test/run.sh` modifies file permissions. Restore them afterwards:
```bash
chmod ugo+r ./test/data/noread
```

## Key Files
- `index.js` (280 lines) - Main Reader class
- `lib/bookmark.js` (125 lines) - Persistence layer
- `lib/line-splitter.js` (57 lines) - Stream transformation
- `test/reader.js` - Main test suite
