const fs = require('fs')
const detect = require('../index')



function readFiles(dir) {
  fs.readdir(dir, (error, files) => {
    files.forEach(file => {
      detect.getBouncedEmailDetail(
        fs.readFileSync(`${dir}/${file}`).toString(),
        result => console.log(result)
      )
    })
  })
}

let folder = `${__dirname}/eml/bounces`
readFiles(folder)
