var fs = require('fs'),
    path = require('path'),
    Package = require('./package'),
    Group = require('./group'),
    Minilog = require('minilog'),
    log = Minilog('glue');

var styles = {
  //styles
  'bold'      : ['\033[1m',  '\033[22m'],
  'italic'    : ['\033[3m',  '\033[23m'],
  'underline' : ['\033[4m',  '\033[24m'],
  'inverse'   : ['\033[7m',  '\033[27m'],
  //grayscale
  'white'     : ['\033[37m', '\033[39m'],
  'grey'      : ['\033[90m', '\033[39m'],
  'black'     : ['\033[30m', '\033[39m'],
  //colors
  'blue'      : ['\033[34m', '\033[39m'],
  'cyan'      : ['\033[36m', '\033[39m'],
  'green'     : ['\033[32m', '\033[39m'],
  'magenta'   : ['\033[35m', '\033[39m'],
  'red'       : ['\033[31m', '\033[39m'],
  'yellow'    : ['\033[33m', '\033[39m']
},
levelMap = { debug: 1, info: 2, warn: 3, error: 4 };

function style(str, style) {
  return styles[style][0] + str + styles[style][1];
}

Minilog
  .pipe(Minilog.backends.nodeConsole)
  .format(function(name, level, args) {
    var colors = { debug: 'blue', info: 'cyan', warn: 'yellow', error: 'red' };
    return (name ? style(name +' ', 'grey') : '')
            + (level ? style(level, colors[level]) + ' ' : '')
            + args.join(' ');
  });

var requireCode = fs.readFileSync(__dirname + '/require.js', 'utf8')
  .replace(/\/*([^/]+)\/\n/g, '')
  .replace(/\n/g, '')
  .replace(/ +/g, ' ');

var defaults = {
  main: 'index.js',
  reqpath: path.dirname(require.cache[__filename].parent.filename)
};

function Renderer(options) {
  var self = this;
  options || (options = { });
  // Package
  this.build = new Package();
  this.build.basepath = options.reqpath = defaults.reqpath;
  this.build.main = defaults.main;
  // The root package is unusual in that it has files that are defined piecemeal
  this.files = new Group();

  this.options = options;
  this.replaced = {};
  this.code = {};
};

// options: debug
Renderer.prototype.set = function(key, val){
  if(key == 'debug') {
    this.build.set(key, val);
  }
  this.options[key] = val;
  return this;
};

// redirect include / exclude / watch to the group
Renderer.prototype.include = function(f) { this.files.include(this._fullPath(f)); return this; };
Renderer.prototype.exclude = function(f) { this.files.exclude(f); return this; };
Renderer.prototype.handler = function(regex, fn) {
  this.build.handlers.push({ re: regex, handler: fn});
  return this;
};

Renderer.prototype.npm = function(name, pathTo) {
  // add the dependency -- on the package (which adds sub-dependencies etc.)
  if(arguments.length == 1 || typeof pathTo == 'undefined') {
    this.build.dependency(this._fullPath(name));
  } else {
    this.build.dependency(name, this._fullPath(pathTo));
  }
  return this;
};

['export', 'reqpath'].forEach(function(key) {
  Renderer.prototype[key] = function(value) {
    this.options[key] = value;
    return this;
  };
});

['main', 'basepath'].forEach(function(key) {
  Renderer.prototype[key] = function(value) {
    this.build[key] = value;
    return this;
  };
});

Renderer.defaults = Renderer.prototype.defaults = function(opts) {
  Object.keys(opts).forEach(function(key) {
    defaults[key] = opts[key];
  });
};

Renderer.prototype.replace = function(module, code) {
  if(arguments.length == 1 && module === Object(module)) {
    Object.keys(module).forEach(function(k) {
      this.replace(k, module[k]);
    }, this);
  } else {
    this.files.exclude(module);
    if(typeof code == 'object') {
      this.replaced[module] = JSON.stringify(code);
    } else {
      // function / number / boolean / undefined all convert to string already
      this.replaced[module] = code;
    }
  }
  return this;
};

Renderer.prototype.define = function(module, code) {
  this.code[module] = code;
  return this;
};

// make it easier to inspect the output by returning it as a object
Renderer.prototype._render = function(onDone) {
  var self = this;
  this._updateBasePath();

  this.build.files = this.files.resolve();

  var result = [];
  this.build.render(result, function(pkgId) {
    var relpath = self.build.main.replace(/^\.\//, '').replace(new RegExp('^'+self.build.basepath), '');
    onDone({
      replaced: self.replaced,
      code: self.code,
      modules: result,
      exportLine: self.options.export + ' = require(\'' +  relpath + '\');'
    });
  });
  return this;
};

Renderer.prototype.render = function(onDone){
  this._render(function(out) {
    // place replaced modules into modules[0]
    Object.keys(out.replaced).forEach(function(key) {
      out.modules[0][key] = '{ exports: ' + out.replaced[key] + ' }\n';
    });
    // place injected code into modules[0]
    Object.keys(out.code).map(function(moduleName) {
      out.modules[0][moduleName] = 'function(module, exports, require){' + out.code[moduleName] + '}\n';
    });
    onDone(undefined, '(function(){'
      + requireCode
      + '\n'
      + out.modules.reduce(function(str, o, counter) {
        var keys = [];
        Object.keys(o).sort().map(function(name){
          keys.push(JSON.stringify(name)+': '+o[name]);
        });
        return str + 'require.modules['+counter+'] = { ' + keys.join(',') + '};\n';
      }, '')
      // name to export
      + out.exportLine + '\n'
      + '}());');
  });
};

Renderer.prototype.watch = function(onDone) {
  var self = this;
  this._updateBasePath();

  var paths = this.files.resolve();

  paths.forEach(function(p) {
    fs.watchFile(p, { interval: 500 }, function(curr, prev) {
      if(curr.mtime.valueOf() == prev.mtime.valueOf()) return;
      log.info('File changed: ' +p+' at ' + curr.mtime);
      if(self.watchTimer) return;
      self.watchTimer = setTimeout(function() {
        self.render(onDone);
        self.watchTimer = null;
      }, 500);
    });
  });
  this.render(onDone);
};

Renderer.prototype._updateBasePath = function() {
  var basepath = this.build.basepath;
  basepath = this._fullPath(basepath);
  basepath += (basepath[basepath.length-1] !== '/' ? '/' : '');
  this.build.basepath = basepath;
}

Renderer.prototype._fullPath = function(p) {
  if(p.substr(0, 1) == '.') {
    p = path.normalize(this.options.reqpath + '/' + p);
  }
  return p;
};

Renderer.concat = Renderer.prototype.concat = function(arr, callback) {
  var data = '';
  function run(callable) {
    if (callable) {
      callable.render(function(err, txt) {
        if (err) return callback(err);
        data += txt;
        return run(arr.shift());
      });
    } else {
      return callback(undefined, data);
    }
  }
  return run(arr.shift());
};

module.exports = Renderer;
