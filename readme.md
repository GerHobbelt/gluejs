# Examples

    Glue
      .include('./lib')
      .replace({
        'jquery': 'window.$',
        'Chat': 'window.Chat'
      })
      .export('App')
      .render(function (err, txt) {
        res.setHeader('content-type', 'application/javascript');
        res.end(txt);
      });

    Glue
      .include('./core')
      .exclude('mocha')
      .replace('debug', function(name) {
        console.log('name', arguments);
      })
      .export('Core')
      .render(function (err, txt) {
        fs.writeFile('./core.js', txt);
      });


## API

.include(directory): recursively includes files in the directory

.include(file): includes a single file

.replace(module, code):

Replaces a module or global with a piece of code

Example: .replace('jquery', 'window.$') require('jquery') should return window.$

Note that you can also pass a function or object rather than a string. In that case, the function is converted to a string and JSON.stringify is applied to a object.

Example: .replace('debug', function debug() { return debug() });

.exclude(regexp): excludes a path from the build completely

.export(name): sets the export name

.render(function(err, text){ ...}): renders the result

.watch(function(err, text){ ...})

Renders the result and adds file watchers on the dependent files.

When the file changes, the callback will be called again, with the newly rendered version.

Note that this API is a bit clunky:

- there is no way to unwatch a file other than terminate the program
- on each watched file change, a console.log() message is shown
- the API uses fs.watchFile(), so you do not get notification of newly added files in directories; watches are registered on the files that were used on the first render

But it works fine for automatically rebuilding e.g. in dev.

.defaults({
  reqpath: '/path/to/first/module/to/require/glue', // all relative paths are relative to this
  basepath: '', // strip this string from each path (e.g. /foo/bar/baz.js with '/foo' becomes 'bar/baz.js')
  main: 'index.js', // main file, preset default is index.js
  export: '', // name for the variable under window to which the package is exported
  replace: { 'jquery': 'window.$' } // require('jquery') should return window.$
})

Set default values.


## TODO

.npm(file.json): includes a package.json
