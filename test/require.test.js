var fs = require('fs'),
    path = require('path'),
    assert = require('assert');

// Since require.js does not export directly:
var Req = new Function(
    fs.readFileSync(__dirname + '/../lib/require.js').toString() +'return require;'
  ).call();

Req.modules[0]['foo'] = new Function('module', 'exports', 'require', 'global',
  'module.exports = "foobar";');

Req.modules[0]['foo/abc.js'] = new Function('module', 'exports', 'require', 'global',
  'module.exports = "abc";');

Req.modules[0]['bar'] = { context: 1, main: 'bar/bar.js' };
Req.modules[0]['baz'] = { context: 2, main: 'baz/nested.js' };

Req.modules[1] = {};

Req.modules[1]['bar/bar.js'] = new Function('module', 'exports', 'require', 'global',
  'module.exports = "bar/bar.js";');

Req.modules[2] = {};

Req.modules[2]['baz/nested.js'] = new Function('module', 'exports', 'require', 'global',
  'module.exports = require("../foo/abc.js");');

Req.modules[2]['foo/abc.js'] = new Function('module', 'exports', 'require', 'global',
  'module.exports = "baz:./foo/abc.js";');

exports['can call the first require without passing a parent path'] = function(done) {
  assert.equal(Req('foo'), 'foobar');
  done();
};

exports['can require a path relative to the base'] = function(done) {
  assert.equal(Req.relative('foo').call({}, './foo/abc.js'), 'abc');
  done();
};

exports['can require a path relative to a subdirectory'] = function(done) {
  assert.equal(Req.relative('bar/baz/abc').call({}, '../../../foo/abc.js'), 'abc');
  done();
};

exports['can require a different module'] = function(done) {
  assert.equal(Req.relative('foo', 0).call({}, 'bar'), 'bar/bar.js');
  done();
};

exports['require in a different module returns local version of file'] = function(done) {
  assert.equal(Req.relative('foo', 0).call({}, 'baz'), 'baz:./foo/abc.js');
  done();
};

// Scenario 1:
// ./index.js => require(./foo, context = 0, path = '');
// ./foo => require(chat, context = 0, path = index.js) #1
// chat
//   ./lib/index.js => require(../view/bar.js, context = 1, path = './lib/index.js') #2
//   ./view/bar.js => require(baz, context = 1, path = 'view/bar.js') #3
//   baz
//      ./baz.js
// #1 needs to use modules[0]['chat/libindex.js']
// (find out that the main file for chat is lib/index.js)
// #2 needs to both have a new relative path ('') and a new context
// #3 needs to find out that the main file for baz is ./baz.js (and not index.js)

// given a require(lookup, parent) call:

// if the lookup is relative, use the current context and don't change the context
// if the lookup is not relative, then
//    1) we must be looking for a submodule in the current context
//    2) once we find and evaluate the submodule,
//       we need to change to it's context for all requires

// Storage:
// modules = [
//   {
//     "/index.js": fn(mod, exp, req.relative(0, '')),
//     "chat": { context: 1, main: 'lib/index.js' }
//   },
//   {
//     "/lib/index.js": fn(mod, exp, req.relative(1, chat.main)),
//     "baz": { context: 1, main: 'index.js' }
//   }
// ]
//
// In order to disambiguate between: require('chat') and require('./chat'),
// we need to store the ./ for files but not for modules


// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('../node_modules/.bin/mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
