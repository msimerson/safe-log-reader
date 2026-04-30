import assert from 'node:assert';
import { Transform } from 'node:stream';
import { describe, it } from 'node:test';
import { LineSplitter } from '../lib/line-splitter.js';

describe('line-splitter', () => {
  it('creates a stream.Transform instance', () => {
    const liner = new LineSplitter();
    assert.ok(liner instanceof Transform);
  });

  it('sets a streams encoding', () => {
    // TODO
  });
});
