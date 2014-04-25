var fs = require('fs'),
    path = require('path'),
    parallel = require('miniq');

var getTasks = require('./get-tasks.js'),
    filterNpm = require('../../item-tasks/filter-npm.js'),
    filterRegex = require('../../item-tasks/filter-regex.js'),
    detectiveDependencies = require('../../list/detective-dependencies.js');

var log = require('minilog')('mapper');

var cacheFileKey = 'cacheFile',
    rawDepsKey = 'rawDeps',
    resolvedDepsKey = 'resolvedDeps',
    renamesKey = 'renames';

function RunQueue(opts) {
  if (!opts || !opts.cache) {
    throw new Error('RunQueue: options.cache is required');
  }

  // options
  this.opts = opts;
  // cache
  this.cache = opts.cache;
  // list of input files that have already been seen
  this._seenFiles = [];
  // shared execution queue
  this._queue = parallel(2);
  // result tuple storage
  this._results = [];
}

// check the cache, return a tuple from the cache if already processed
RunQueue.prototype.hasCached = function(filename) {
  var cacheFile, rawDeps, resolvedDeps, renames;
  // cached stuff:
  // - an output file
  cacheFile = this.cache.file(filename).path(cacheFileKey);
  // - a set of renamed deps
  rawDeps = this.cache.file(filename).data(rawDepsKey);
  // - a set of normalized deps
  resolvedDeps = this.cache.file(filename).data(resolvedDepsKey);
  // - a set of unnormalized deps
  renames = this.cache.file(filename).data(renamesKey);

  // all items must exist in the cache for this to match
  if (cacheFile && rawDeps && resolvedDeps && renames) {
    // caching should have the exact same effect as full exec
    // push the result and add resolvedDeps
    this.addResult(filename, cacheFile, rawDeps, resolvedDeps, deps, renames);
    return true;
  }
  return false;
};

RunQueue.prototype.add = function(filename) {
  var self = this,
      opts = this.opts;
  // check that the file has not already been queued
  if (this._seenFiles.indexOf(filename) != -1) {
    return;
  }
  this._seenFiles.push(filename);
  // check that the file does not exist in cache
  if (this.hasCached(filename)) {
    return;
  }
  // Apply exclusions
  // Exclude files using the npmjs defaults for file and path exclusions
  var excludeChecks = [filterNpm],
      excludeList = [];
  // If there are any default or user-defined excludes, apply them
  if (excludeList.length > 0) {
    excludeChecks.push(function(filename) {
      return filterRegex(filename, excludeList);
    });
  }
  var isExcluded = excludeChecks.some(function(fn) {
    // filter-style: return true to include, false to exclude
    return !fn(filename);
  });
  if (isExcluded) {
    log.info('File excluded', filename);
    return;
  }

  log.info('Add', filename);

  // add to queue (and run)
  this._queue.exec([
    function(done) {
      // Resolve tasks just prior to processing the file

      // Tasks should not create any resources until unwrapped
      // [
      //    function() { return syncFn | asyncFn | spawn | duplex stream; };
      // ]

      // CACHING:
      // none of the tasks should perform any caching.
      // all caching should only apply at the top level (e.g. operation granularity)

      // match transformations
      var tasks = (path.extname(filename) != '.json' ? getTasks(filename, opts) : []);

      // tasks empty? skip and produce a new tuple
      if (tasks.length === 0) {
        // cache the output file: in this case, it'll be a direct reference to
        // the file itself
        self.cache.file(filename).path(cacheFileKey, filename);

        // run the parse-and-update-deps task
        return self.parseAndUpdateDeps(filename, filename, done);
      }

      // add parse-result-and-update-deps task
      // Wrapping and final file size reporting are inherently serial (because they are
      // part of the join-into-single-file Reduce task)
      var task = new Task(tasks);

      var cacheFile = cache.filepath();

      task.once('done', function() {
        // cache the output file name
        self.cache.file(filename).path(cacheFileKey, cacheFile);

        // at the end, the result file has to be parsed
        // 1) the real cache file must be piped in
        // 2) but the dependency resolution itself must be done using the
        // original location!
        self.parseAndUpdateDeps(filename, cacheFile, done);
      });

      task.input(fs.createReadStream(filename))
          .output(fs.createWriteStream(cacheFile))
          .exec();
    }]);
};

RunQueue.prototype.parseAndUpdateDeps = function(filename, cacheFile, done) {
  var self = this;
  detectiveDependencies(filename, function(err, rawDeps, resolvedDeps, renames) {
    // do not store result when an error occurs
    if (!err) {
      // store the dependencies
      self.cache.file(filename).data(rawDepsKey, rawDeps);
      // store the normalized dependencies
      self.cache.file(filename).data(resolvedDepsKey, resolvedDeps);
      // store the renamed dependencies
      self.cache.file(filename).data(renamesKey, renames);
    } else {
      log.debug('Skipping cache due to errors:', filename);
    }
    self.addResult(filename, cacheFile, rawDeps, resolvedDeps, renames);
    // queue has been updated, finish this task
    done();
  });
};

RunQueue.prototype.addResult = function(filename, cacheFile, rawDeps, resolvedDeps, renames) {
  var self = this;
  this._results.push({
    filename: filename,
    content: cacheFile,
    rawDeps: rawDeps,
    deps: resolvedDeps,
    renames: renames
  });
  // add deps to the queue -> this also queues further tasks
  resolvedDeps.forEach(function(dep) {
    self.add(dep);
  });
};

RunQueue.prototype.exec = function(onDone) {
  var self = this;
  if (onDone) {
    this._queue.once('empty', function() {
      onDone(null, self._results);
    });
  }
};

module.exports = function(opts, onDone) {
  if (!opts || !opts.include) {
    throw new Error('Runner: opts.include is required!');
  }
  // Initialize queue
  var runner = new RunQueue(opts);

  // add initial files to the RunQueue
  (Array.isArray(opts.include) ? opts.include : [opts.include]).forEach(function(filename) {
    runner.add(filename);
  });

  // start the queue
  runner.exec(onDone);
};
