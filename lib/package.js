var fs = require('fs'),
    resolver = require('package-json-resolver');

function series(callbacks, last) {
  function next() {
    var callback = callbacks.shift();
    if(callback) {
      callback(next);
    } else {
      last();
    }
  }
  next();
}

var handlers = [
  {
    // take all the .js files and concatenate them
    re: new RegExp('.*\.js$'),
    handler: function(opts, done) {
      return done(opts.wrap(opts.filename, fs.readFileSync(opts.filename, 'utf8')));
    }
  }
];

function Package() {
  this.name = '';
  this.main = '';
  this.basepath = '';
  this.files = [];
  this.children = [];
};

Package.prototype.dependency = function(name, contextPath) {
  var self = this;
  if(arguments.length == 1) {
    // npm package
    var fullPath = name,
        packageContent = require(fullPath);
    packageContent.dependencies.forEach(function(depname) {
      self.dependency(dep, path.dirname(fullPath));
    });
  } else {
    var child = new Package();

    resolver.expand(resolver.resolve(contextPath, name), function(basePath, main, files, dependencies) {
      child.name = name;
      child.files = files;
      child.main = main.replace(new RegExp('^'+basePath), '');
      child.basepath = basePath;
      dependencies.forEach(function(dep) {
        child.dependency(dep, basePath);
      });

      self.children.push(child);
    });
  }
  return this;
};

Package.prototype._runHandlers = function(selfId, onDone) {
  var self = this;
  function relative(filename){
    return filename.replace(new RegExp('^'+self.basepath), '');
  }
  function wrap(filename, source) {
    var relpath = relative(filename),
        opt = {};
    return 'function(module, exports, require){' +
           (opt.debug?
              'eval(' + JSON.stringify(source + '\n\/\/@ sourceURL=/'+self.name+'/'+relpath)+');' : source) +
           '};\n';
  }

  var opts = { wrap: wrap, relative: relative },
      result = {},
      tasks = [];

  // create tasks for each file
  // We will only allow one handler to match each file, since this makes things less confusing

  this.files.forEach(function(filename) {
    var matching = handlers.filter(function(handler) {
      return handler.re.test(filename);
    });
    if(matching.length == 0) {
      console.log('Warn: ', filename, 'not handled');
      return;
    } else if(matching.length > 1) {
      console.log('Warn: ', filename, 'matches multiple handlers');
      return;
    }
    tasks.push( function(done) {
      opts.filename = filename;
      opts.relativeFilename = opts.relative(filename);
      matching[0].handler(opts, function(data) {
        result[opts.relativeFilename] = data;
        done();
      });
    });
  });

  // serial execution for tasks
  series(tasks, function() { onDone(result); });
};


Package.prototype.render = function(result, onDone) {
  var self = this,
      selfId = result.length,
      tasks = [];
  this._runHandlers(selfId, function(fileObj) {
    // store the result of building our own files
    result[selfId] = fileObj;
    // render each child
    self.children.forEach(function(child) {
      tasks.push(function(done) {
        child.render(result, function(childId) {
          // for each child, add a reference
          result[selfId][child.name] = JSON.stringify({ context: childId, main: child.main })+';';
          done();
        });
      });
    });

    series(tasks, function() {
      onDone(selfId);
    });
  });

};

module.exports = Package;
