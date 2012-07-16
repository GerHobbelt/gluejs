var fs = require('fs'),
    Glue = require('../../lib/glue.js');

new Glue()
  .include('./input')
  .basepath('./input')
  .export('myApp')
  .set('debug', true)
  .render(function (err, txt) {
    fs.writeFileSync('./generated.js', txt);
  });
