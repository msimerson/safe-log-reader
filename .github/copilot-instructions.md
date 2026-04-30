# Copilot Instructions for safe-log-reader

## Project Overview

**safe-log-reader** is a Node.js ESM library for reliably reading log files with automatic resumption at safe positions. It handles file rotation, compressed archives (gzip), and multi-byte UTF-8 characters. The key innovation is the bookmark system that persists reading position by inode + line number, enabling safe recovery after interruptions without duplicate or skipped lines.

## Build, Test, and Lint

### Running Tests
```bash
npm test                     # Full test suite (with file permission setup via test/run.sh)
npm run test:coverage        # Test with coverage reporting
npm run test:coverage:lcov   # Generate LCOV coverage report
```

Test environment variables:
- `NODE_ENV=test` suppresses logger output for cleaner test runs
- `DEBUG=true` enables debug logging
- Bookmark tests use `test/.bookmarks` directory

### Linting
```bash
npm run lint    # Run ESLint on all source and test files
```

### No Build Step
This is a zero-dependency library. No build process required.

## Architecture

### Core Components

**index.js (Reader class)**
- Main export: `createReader(filePath, options)` returns an EventEmitter
- All internal methods are private (`#method()` syntax); only `watchStop()` is public
- Lifecycle: stat file → create stream → pipe through LineSplitter → emit `read` events → save bookmark on drain → repeat

**lib/bookmark.js**
- Persists reading position as JSON keyed by file inode
- Stores: file path, byte offset, line count, inode
- Atomic writes via temp file + rename to prevent corruption
- Safe byte offsets only saved when EOF reached (otherwise buffered data may be lost)

**lib/line-splitter.js (Transform Stream)**
- Converts raw byte chunks to line strings
- Handles multi-byte UTF-8 characters correctly via StringDecoder
- Emits one line per `push()`
- Buffers incomplete lines until separator found

**lib/logger.js**
- Stub logging for extensibility (meant to be overridden with Winston, log4js, etc.)
- Respects: `DEBUG` env var, `NODE_ENV=test` silences output

### Event Flow
1. `'readable'` fires when data is available from the stream
2. `'read'` emitted per line with `(line, lineNumber)`
3. When `batchLimit` lines reached (or EOF): `'drain'` emitted with a `done` callback
4. Consumer calls `done(err, delaySeconds)` to save bookmark and resume
5. `'end'` emitted when stream exhausted; watcher is active

### Bookmark Safety Model
- **Problem**: Reading stops mid-file at arbitrary byte position, possibly mid-line or mid-UTF8-character
- **Solution**: Track line numbers, save byte offsets only when EOF reached, use inodes to detect file rotation
- **Resume**: Uses byte position after confirmed-safe EOF; falls back to line-count skipping otherwise
- When file rotates (inode changes), new bookmark starts fresh

## Coding Conventions

### Style & Patterns
- ES Modules (`import`/`export`), Node.js built-in modules use `node:` prefix
- `async`/`await` throughout; all I/O uses `fs/promises`
- Private class methods via `#method()` syntax (ES2022)
- Event-driven via EventEmitter for the public API
- Single quotes for strings

### Variable Naming
- `filePath` for resolved absolute paths
- `bmPath` for bookmark files
- `bytesOffset` / `lines.position` for tracking progress
- `liner` for the Transform stream instance
- `mark` for bookmark objects

### Error Handling
- Async errors propagate via `throw` / rejected promises
- Tests use `assert.rejects()` for expected async errors
- Environment variables for test/debug modes

### File Permissions in Tests
Test setup handles special permissions:
```bash
chmod ugo-r ./test/data/test-no-perms.log  # Unreadable file
chmod ugo-w ./test/data/nowrite            # Unwritable dir
chmod ugo-r ./test/data/noread             # Unreadable dir
```

## Key Files
- `index.js` — Main Reader class and `createReader` export
- `lib/bookmark.js` — Persistence layer (async, atomic writes)
- `lib/line-splitter.js` — Transform stream: bytes → lines
- `test/reader.js` — Main integration test suite
- `test/run.sh` — Test runner (handles permissions + optional coverage)
