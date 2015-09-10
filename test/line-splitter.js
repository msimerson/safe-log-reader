'use strict';

var assert = require('assert');
var stream = require('stream');

var LineSplitter = require('../lib/line-splitter');

describe('line-splitter', function () {
  it('creates an stream.Transform instance', function (done) {
    var liner = new LineSplitter();
    assert.ok(liner instanceof stream.Transform);
    done();
  });

  it('sets a streams encoding', function (done) {
    // TODO
    done();
  });
});
