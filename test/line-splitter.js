'use strict';

const assert = require('assert')
const stream = require('stream')

const LineSplitter = require('../lib/line-splitter')

describe('line-splitter', () => {
  it('creates a stream.Transform instance', function (done) {
    const liner = new LineSplitter();
    assert.ok(liner instanceof stream.Transform);
    done();
  })

  it('sets a streams encoding', function (done) {
    // TODO
    done();
  })
})
