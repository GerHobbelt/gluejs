var fs = require('fs'),
    path = require('path'),
    annotateStructured = require('./annotate-structured.js');

// Applies multiple annotations
//
// Takes `list.files` as the input and generates `list.packages`

module.exports = function(list, options) {
  // regroup the files by splitting each name on the directory separator
  annotateStructured(list);
  var structured = list.structured;

  function exists(path) {
    return list.files.some(function(item) { return item.name == path; });
  }

  function getMainFile(basepath, files) {
    var mainFile;
    if(files && files.indexOf('package.json') > -1) {
      // 1. package.json
      var data = JSON.parse(fs.readFileSync(basepath+'/package.json'));
      if(data.main) {
        var guess = path.resolve(basepath, data.main);
        if(exists(guess)) {
          mainFile = data.main;
        } else if(exists(guess + '.js')) {
          mainFile = data.main + '.js';
        } else if(exists(guess + '.json')) {
          mainFile = data.main + '.json';
        } else if(exists(guess + '/index.js')) {
          mainFile = path.normalize(data.main + '/index.js');
        }
      }
    }
    if(!mainFile && files && files.indexOf('index.js') > -1) {
      // 2. index.js
      mainFile = 'index.js';
    }

    // 3. index.node (unsupported - binary addition)
    return mainFile;
  }

  // console.log(structured);

  var packages = [ { files: [], dependencies: {} } ];

  // we cannot auto-detect the basepath (since the base package might consist of multiple
  // different directories) but we can read it in
  if(options.basepath) {
    packages[0].basepath = options.basepath;
  }

  function getPackage(root, currentPath, packageIndex) {
    var relPath = currentPath;
    // relative path excludes the package basepath for the current package
    if(packages[packageIndex].basepath) {
      relPath = currentPath.substr(packages[packageIndex].basepath.length);
    }
    // handle files
     if(root['.']) {
        root['.'].forEach(function(filename) {
            packages[packageIndex].files.push( relPath + filename );
        });
     }

    Object.keys(root).forEach(function(dirname) {
      var packageName, packageBase, index,
          mainFile;
      if(dirname != 'node_modules' && dirname != '.') {
        getPackage(root[dirname], currentPath + dirname + '/', packageIndex);
      } else if(dirname == 'node_modules') {
        // single file packages
        if(root['node_modules']['.']) {
          root['node_modules']['.'].forEach(function(filename) {
            // add single-file package
            packageName = filename.replace(/(\.js|\.json)$/, ''),
            packageBase = currentPath + '/node_modules';
            index = packages.length;
            mainFile = filename;

            packages[index] = {
              name: packageName,
              basepath: packageBase,
              main: mainFile,
              files: [ filename ],
              dependencies: {}
            };
            // add parent dependency
            packages[packageIndex].dependencies[packageName] = index;
          });
        }
        // handle modules
        Object.keys(root['node_modules']).forEach(function(dirname) {
          if(dirname != '.') {
            // create a new package
            index = packages.length;
            packageName = dirname;
            packageBase = currentPath + 'node_modules/'+ dirname +'/';
            var files = root['node_modules'][dirname]['.'];

            // detect the main file
            mainFile = getMainFile(packageBase, files);

            packages[index] = {
              name: packageName,
              basepath: packageBase,
              main: mainFile,
              files: [],
              dependencies: {}
            };
            // add parent dependency
            packages[packageIndex].dependencies[packageName] = index;
            // traverse
            getPackage(root.node_modules[dirname], packageBase, index);
          }
        });
      }
    });
  }

  // the first package contains all files until we reach the first 'node_modules'
  // all other packages are delineated by a node_modules transition
  getPackage(structured, '/', 0);

  // set main path from options if given
  if(options.main) {
    packages[0].main = options.main;
  }
  // after completing the packagification
  // detect the main file for the root package (but only if it has a basepath)
  if(packages[0].basepath && !packages[0].main) {
    packages[0].main = getMainFile(packages[0].basepath, packages[0].files);
  }

  list.packages = packages;
};

// to override the fs module, which is only used for reading in package.json files
module.exports._setFS = function(newFs) {
  fs = newFs;
}
