const fs = require('fs');
const detect = require('../index');
const expect = require('chai').expect;

function readFiles(dir, cb) {
  return new Promise(resolve => {
    let data = [];
    fs.readdir(dir, (error, files) => {
      files.forEach(file => {
        data.push(fs.readFileSync(dir + '/' + file))
      });
      resolve(data);
    });
  });
}

describe("It get info about emails with callback", () => {
  it("Should detect bounces", () => {
    let folder = __dirname + '/eml/bounces/';
    readFiles(folder, (data) => {
      detect.getBouncedEmailDetail(data.toString(), (result) => {
        expect(result.is).to.be.string('bounce');
        expect(Object.keys(result).length).to.be.eq(6);
      });
    });
  });

  it("Should detect FBL", () => {
    let folder = __dirname + '/eml/fbl/';
    readFiles(folder, (data) => {
      detect.getBouncedEmailDetail(data.toString(), (result) => {
        expect(result.is).to.be.string('FBL');
        expect(Object.keys(result).length).to.be.eq(6);
      });
    });
  });

  it("Should detect normal mails", () => {
    let folder = __dirname + '/eml/ok/';
    readFiles(folder, (data) => {
      detect.getBouncedEmailDetail(data.toString(), (result) => {
        expect(result.is).to.be.string('OK');
        expect(Object.keys(result).length).to.be.eq(6);
      });
    });
  });
});

describe("It get info about emails with promise", () => {
  it("Should detect bounces", (done) => {
    let folder = __dirname + '/eml/bounces/';
    let promises = [];
    readFiles(folder).then(data => {
      data.forEach(row => {
        promises.push(detect.getBouncedEmailDetail(data.toString()));
      });

      Promise.all(promises).then(results => {
        results.forEach(result => {
          expect(result.is).to.be.string('bounce');
          expect(Object.keys(result).length).to.be.eq(6);
        });
        done();
      })
    });
  });

  it("Should detect FBL", (done) => {
    let folder = __dirname + '/eml/fbl/';
    let promises = [];
    readFiles(folder).then(data => {
      data.forEach(row => {
        promises.push(detect.getBouncedEmailDetail(data.toString()));
      });

      Promise.all(promises).then(results => {
        results.forEach(result => {
          expect(result.is).to.be.string('FBL');
          expect(Object.keys(result).length).to.be.eq(6);
        });

        done();
      })
    });
  });

  it("Should detect normal mails", (done) => {
    let folder = __dirname + '/eml/ok/';
    let promises = [];
    readFiles(folder).then(data => {
      data.forEach(row => {
        promises.push(detect.getBouncedEmailDetail(data.toString()));
      });

      Promise.all(promises).then(results => {
        results.forEach(result => {
          expect(result.is).to.be.string('OK');
          expect(Object.keys(result).length).to.be.eq(6);
        });

        done();
      })
    });
  });
});

describe("Test if an email is a bounce message", () => {
  it("Should detect a not bounce with callback", () => {
    detect.isBouncedEmail(fs.readFileSync(__dirname + '/eml/ok/npm.eml').toString(), result => {
      expect(result).to.be.false;
    })
  });

  it("Should detect a bounce with callback", () => {
    detect.isBouncedEmail(fs.readFileSync(__dirname + '/eml/bounces/10.eml').toString(), result => {
      expect(result).to.be.true;
    })
  });

  it("Should detect a not bounce with promise", (done) => {
    detect.isBouncedEmail(fs.readFileSync(__dirname + '/eml/ok/npm.eml').toString()).then(result => {
      expect(result).to.be.false;
      done();
    })
  });

  it("Should detect a bounce with promise", (done) => {
    detect.isBouncedEmail(fs.readFileSync(__dirname + '/eml/bounces/10.eml').toString()).then(result => {
      expect(result).to.be.true;
      done();
    })
  });
});
