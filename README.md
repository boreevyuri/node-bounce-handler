> This is a fork of [prasad83/node-bounce-handler](https://github.com/prasad83/node-bounce-handler).

# NodeJS Bounce Snoop

Port of (PHP-Bounce-Handler - <https://github.com/cfortune/PHP-Bounce-Handler> v7.3) in NodeJS.

# Usage

```javascript
  var MailBounceSnoop = require('bounce-handler').MailBounceSnoop;
  var bh = new MailBounceSnoop();
  var bounceResult = bh.parse_email(emlDataString);
```

# About PHP-Bounce-Handler

This class can be used to parse bounced message reports. It parses e-mail messages with multipart report content type formatted according to RFC 1892 and 1894 documents. If the bounce is not well formed, it also tries to extract some useful information. Exim is supported, partially. More... <http://anti-spam-man.com/php_bouncehandler/>
