
var assert = require('assert');
var stream = require('stream');

var Liner  = require('../lib/liner');

describe('liner', function () {
    it('creates an stream.Transform instance', function (done) {
        var liner = new Liner();
        assert.ok(liner instanceof stream.Transform);
        done();
    });
});