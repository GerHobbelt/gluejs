var path = require('path'),
    List = require('minitask').list,
    packageCommonJs = require('./lib/runner/package-commonjs');

// API wrapper
function API() {
  this.files = new List();
  this.options = {
    replaced: {}
  };
}

API.prototype.include = function(filepath) {
  this.files.add(path.resolve(process.cwd(), filepath));
  console.log(this.files);
  return this;
};

API.prototype.render = function(dest) {
  if(typeof dest == 'function') {

  } else if(dest.write) {
    // writable stream
    packageCommonJs(this.files, this.options, dest, function() {
      dest.end();
    });
  }
};

// NOPs

// setters
API.defaults = API.prototype.defaults = function(opts) {};
API.prototype.set = function(key, val) {};

['export', 'main'].forEach(function(key) {
  API.prototype[key] = function(value) {
    this.options[key] = value;
    return this;
  };
});

API.prototype.basepath = function(value) {
  this.options.basepath = path.resolve(process.cwd(), value);
  return this;
};

// other
API.prototype.replace = function(module, code) {
  if(arguments.length == 1 && module === Object(module)) {
    Object.keys(module).forEach(function(k) {
      this.replace(k, module[k]);
    }, this);
  } else {
    // TODO: exclude the module with the same name

    if(typeof code == 'object') {
      this.options.replaced[module] = JSON.stringify(code);
    } else {
      // function / number / boolean / undefined all convert to string already
      this.options.replaced[module] = code;
    }
  }

  return this;
};

API.prototype.exclude = function(path) {};
API.prototype.npm = function(name, pathTo) {};
API.prototype.handler = function(regex, fn) {};
API.prototype.define = function(module, code) {};
API.prototype.watch = function(onDone) {};
API.concat = function(arr, callback) {};

// deprecated
API.prototype.reqpath = function(value) {};

module.exports = API;
