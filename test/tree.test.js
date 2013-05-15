var fs = require('fs'),
    path = require('path'),
    assert = require('assert'),
    Tree = require('../lib/tree.js');

exports['given a tree'] = {

  beforeEach: function() {
    this.tree = new Tree();
  },

  'can add a single file': function () {
    var g = this.tree;
    var result = g.add(__dirname+'/fixtures/single-file/simple.js').files;
    assert.equal(result.length, 1);
    assert.equal(result[0], path.normalize(__dirname+'/fixtures/single-file/simple.js'));
  },

  'can add a directory': function() {
    var g = this.tree;
    var result = g.add(__dirname+'/fixtures/single-file/').files;
    assert.equal(result.length, 2);
    assert.equal(result[0], path.normalize(__dirname+'/fixtures/single-file/has_dependency.js'));
    assert.equal(result[1], path.normalize(__dirname+'/fixtures/single-file/simple.js'));

    console.log(g);
  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stderr.on('data', function (data) { if (/^execvp\(\)/.test(data)) console.log('Failed to start child process. You need mocha: `npm install -g mocha`') });
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
