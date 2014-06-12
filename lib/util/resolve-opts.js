var fs = require('fs'),
    path = require('path'),
    nodeResolve = require('resolve');

exports.inferBasepath = function(basepath, includes) {
  if (basepath) {
    return path.resolve(process.cwd(), basepath);
  }

  var first = (typeof includes === 'string' ? includes : includes[0]),
      firstStat;

  if (first.charAt(0) == '/') {
    // abs path to a file => use parent dir as basepath
    firstStat = (fs.existsSync(first) ? fs.statSync(first) : false);
    return (firstStat && firstStat.isFile() ? path.dirname(first) : first);
  }
  if (first.charAt(0) == '.') {
    // relative include => use process.cwd
    return process.cwd();
  }
  return;
};

exports.resolvePackage = function(to, from) {
  if (from.charAt(0) == '.' || from.charAt(0) == '/') {
    return from;
  }
  return nodeResolve.sync(from, { basedir: to });
};

exports.getPackageRoot = function(basepath, key) {
  if (nodeResolve.isCore(key)) {
    return false;
  }
  var modulePath = exports.resolvePackage(basepath, key),
      stat = fs.statSync(modulePath);

  // for modules, exclude the root directory of the module (or just the plain file for single file
  // packages) to prevent it or any related files from being parsed

  if (stat.isDirectory()) {
    return modulePath;
  } else if (stat.isFile()) {
    // do not exclude the whole node_modules folder if this a one file module
    if (path.basename(path.dirname(modulePath)) == 'node_modules') {
      return modulePath;
    } else {
      return path.dirname(modulePath) + path.sep;
    }
  }
};

exports.inferMain = function(basepath, includes) {
  // update first include (apply inferred basepath)
  var first = (typeof includes === 'string' ? includes : includes[0]),
      firstStat = (fs.existsSync(first) ? fs.statSync(first) : false);

  if (firstStat && firstStat.isFile()) {
    // set main the first include is a file, use it as the main
    return path.relative(basepath, first);
  }
  if (firstStat && firstStat.isDirectory()) {
    // one file in directory
    var content = fs.readdirSync(first).filter(function(file) {
      return path.extname(file) === '.js';
    });
    if (content.length === 1) {
      return path.relative(basepath, first + '/' + content[0]);
    } else if (content.indexOf('index.js') > -1) {
      return path.relative(basepath, first + '/index.js');
    }
  }
  return;
};
