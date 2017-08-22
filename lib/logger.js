'use strict';

// this is a stub library. Overload/extend these functions with a more
// feature-filled or robust library such as winston, log4js, or npmlog.

exports.debug = function (msg) {
  if (!process.env.DEBUG) return;
  console.log(msg);
};

['info', 'error'].forEach(i => {
  exports[i] = function (msg) {
    if (process.env.NODE_ENV === 'test') return;  // nice quiet tests
    console[i](msg);
  }
})