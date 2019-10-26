'use strict';

const EOL = '\r\n';
const PARTS_DELIMITER = EOL + EOL;
const libmime = require('libmime');

module.exports = class Email {
  constructor(plainMessage) {
    this.plainMessage = '';
    this.headerPlain = '';
    this.bodyPlain = '';
    this.header = new Map();

    this.setMessage(plainMessage);
    this.initMail()
  }

  setMessage(plainMessage) {
    this.plainMessage = plainMessage.replace(/\r\n/g, "\n"); // line returns 1
    this.plainMessage = this.plainMessage.replace(/\n/g, "\r\n"); // line returns 2
    this.plainMessage = this.plainMessage.replace(/=\r\n /g, "= "); // remove MIME line breaks
    this.plainMessage = this.plainMessage.replace(/=3D/g, "="); // equals sign =
    this.plainMessage = this.plainMessage.replace(/=09/g, "  "); // tabs
  }

  hasHeader(header) {
    return this.header.has(header);
  }

  getHeader(header) {
    return this.header.has(header) ? this.header.get(header) : null;
  }

  getHeaders() {
    return this.header
  }

  getBody() {
    return this.bodyPlain
  }

  initMail() {
    if (this.plainMessage === '') {
      throw Error('Empty Message given');
    }

    let parts = this.plainMessage.split(PARTS_DELIMITER);

    if (parts.length < 2) {
      throw Error('Message does not contain a header and body part');
    }

    this.headerPlain = parts.shift();
    this.bodyPlain = parts.join(PARTS_DELIMITER);

    this.parseHeader();
    if (!this.header.has('subject')) {
      this.header.set('subject', '(no-subject)')
    }
  }

  parseHeader() {
    function normalizeHeader(key) {
      return (key || '').toLowerCase().trim();
    }

    let lines = this.headerPlain
      .toString('binary')
      .replace(/[\r\n]+$/, '')
      .split(/\r?\n/);

    for (let i = lines.length - 1; i >= 0; i--) {
      let chr = lines[i].charAt(0);
      if (i && (chr === ' ' || chr === '\t')) {
        lines[i - 1] += '\r\n' + lines[i];
        lines.splice(i, 1);
      } else {
        let line = lines[i];
        let key = normalizeHeader(line.substr(0, line.indexOf(':')));
        lines[i] = {
          key,
          line
        };
      }
    }

    this.header = this.processHeaders(lines);
  }

  processHeaders(lines) {
    let headers = new Map();
    (lines || []).forEach(line => {
      let key = line.key ? line.key : '';
      let value = ((libmime.decodeHeader(line.line) || {}).value || '').toString().trim();
      value = Buffer.from(value, 'binary').toString();
      switch (key) {
        case 'content-type':
        case 'content-disposition':
        case 'dkim-signature':
          value = libmime.parseHeaderValue(value);
          Object.keys((value && value.params) || {}).forEach(key => {
            try {
              value.params[key] = libmime.decodeWords(value.params[key]);
            } catch (E) {
              // ignore, keep as is
            }
          });
          break;
        case 'date':
          value = new Date(value);
          if (!value || value.toString() === 'Invalid Date' || !value.getTime()) {
            // date parsing failed :S
            value = new Date();
          }
          break;
        case 'subject':
          try {
            value = libmime.decodeWords(value);
          } catch (E) {
            // ignore, keep as is
          }
          break;
        case 'references':
          //value = value.split(/\s+/).map(this.ensureMessageIDFormat);
          break;
        case 'message-id':
          //value = this.ensureMessageIDFormat(value);
          break;
        case 'in-reply-to':
          //value = this.ensureMessageIDFormat(value);
          break;
        case 'priority':
        case 'x-priority':
        case 'x-msmail-priority':
        case 'importance':
          key = 'priority';
          //value = this.parsePriority(value);
          break;
        case 'from':
        case 'to':
        case 'cc':
        case 'bcc':
        case 'sender':
        case 'reply-to':
        case 'delivered-to':
        case 'return-path':
         /* value = addressparser(value);
          this.decodeAddresses(value);
          value = {
            value,
            html: this.getAddressesHTML(value),
            text: this.getAddressesText(value)
          };*/
          break;
      }

      // handle list-* keys
      if (key.substr(0, 5) === 'list-') {
        value = this.parseListHeader(key.substr(5), value);
        key = 'list';
      }

      if (value) {
        if (!headers.has(key)) {
          headers.set(key, [].concat(value || []));
        } else if (Array.isArray(value)) {
          headers.set(key, headers.get(key).concat(value));
        } else {
          headers.get(key).push(value);
        }
      }
    });

    // keep only the first value
    let singleKeys = [
      'message-id',
      'content-id',
      'from',
      'sender',
      'in-reply-to',
      'reply-to',
      'subject',
      'date',
      'content-disposition',
      'content-type',
      'content-transfer-encoding',
      'priority',
      'mime-version',
      'content-description',
      'precedence',
      'errors-to'
    ];

    headers.forEach((value, key) => {
      if (Array.isArray(value)) {
        if (singleKeys.includes(key) && value.length) {
          headers.set(key, value[value.length - 1]);
        } else if (value.length === 1) {
          headers.set(key, value[0]);
        }
      }

      if (key === 'list') {
        // normalize List-* headers
        let listValue = {};
        [].concat(value || []).forEach(val => {
          Object.keys(val || {}).forEach(listKey => {
            listValue[listKey] = val[listKey];
          });
        });
        headers.set(key, listValue);
      }
    });

    return headers;
  }

  parseListHeader(key, value) {
    let addresses = addressparser(value);
    let response = {};
    let data = addresses
      .map(address => {
        if (/^https?:/i.test(address.name)) {
          response.url = address.name;
        } else if (address.name) {
          response.name = address.name;
        }
        if (/^mailto:/.test(address.address)) {
          response.mail = address.address.substr(7);
        } else if (address.address && address.address.indexOf('@') < 0) {
          response.id = address.address;
        } else if (address.address) {
          response.mail = address.address;
        }
        if (Object.keys(response).length) {
          return response;
        }
        return false;
      })
      .filter(address => address);
    if (data.length) {
      return {
        [key]: response
      };
    }
    return false;
  }
};
