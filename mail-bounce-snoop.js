'use strict';

const bounce_responses = require('./responses');
const libmime = require('libmime');

/* BOUNCE HANDLER Class, Version 7.3
 * Description: "chops up the bounce into associative arrays"
 *     ~ http://www.anti-spam-man.com/php_bouncehandler/v7.3/
 *     ~ https://github.com/cfortune/PHP-Bounce-Handler/
 *     ~ http://www.phpclasses.org/browse/file/11665.html
 */

/* Debugging / Contributers:
 * "Kanon"
 * Jamie McClelland http://mayfirst.org
 * Michael Cooper
 * Thomas Seifert
 * Tim Petrowsky http://neuecouch.de
 * Willy T. Koch http://apeland.no
 * ganeshaspeaks.com - FBL development
 * Richard Catto - FBL development
 * Scott Brynen - FBL development  http://visioncritical.com
 */


/*
 The BSD License
 Copyright (c) 2006-forever, Chris Fortune http://cfortune.kics.bc.ca
 All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
    * Neither the name of the MailBounceHandler nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
function MailBounceSnoop() {

  /**** VARS ****************************************************************/
  this.fbl_hash = [];
  this.body_hash = []; // not necessary
  this.bouncelist = []; // from bounce_responses.txt
  this.autorespondlist = []; // from bounce_responses.txt

  this.looks_like_a_bounce = false;
  this.looks_like_an_FBL = false;
  this.looks_like_an_autoresponse = false;
  this.is_hotmail_fbl = false;


  // accessors
  this.type = '';

  // these accessors are useful only for FBL's
  // or if the output array has only one index
  this.action = '';
  this.status = '';
  this.subject = '';
  this.recipient = '';
  this.body = '';

  this.mime_sections = [];

  // the raw data set, a multiArray
  this.output = [];

  /**** INSTANTIATION *******************************************************/
  this.output.push({
    'action': '',
    'status': '',
    'message': '',
    'recipient': '',
    'messageid': '',
    'is': ''
  });

  this.bouncelist = bounce_responses.bouncelist;
  this.autorespondlist = bounce_responses.autorespondlist;

  /**** METHODS *************************************************************/
  this.simpleCheckResponse = function () {
    switch (true) {
      case this.looks_like_a_bounce:
        return 'bounce';
      case this.looks_like_an_FBL:
        return 'FBL';
      case this.looks_like_an_autoresponse:
        return 'autoresponse';
      default:
        return 'OK'
    }
  };

  this.looksLikeAnFBLAction = function (mail) {
    this.output[0]['action'] = 'failed';
    this.output[0]['status'] = '5.7.1';
    this.subject = mail.getHeader('subject').replace(/Fw:/gi, '').trim();
    if (this.is_hotmail_fbl === true) {
      // fill in the fbl_hash with sensible values
      this.fbl_hash['Content-disposition'] = 'inline';
      this.fbl_hash['Content-type'] = 'message/feedback-report';
      this.fbl_hash['Feedback-type'] = 'abuse';
      this.fbl_hash['User-agent'] = 'Hotmail FBL';
      if (typeof this.first_body_hash['Date'] !== 'undefined') {
        this.fbl_hash['Received-date'] = this.first_body_hash['Date'];
      }
      if (this.recipient) {
        this.fbl_hash['Original-rcpt-to'] = this.recipient;
      }
      if (typeof this.first_body_hash['X-sid-pra'] !== 'undefined') {
        this.fbl_hash['Original-mail-from'] = this.first_body_hash['X-sid-pra'];
      }
    } else {

      this.fbl_hash = this.standard_parser(this.mime_sections['machine_parsable_body_part']);
      let returnedhash = this.standard_parser(this.mime_sections['returned_message_body_part']);
      if (!this.fbl_hash['Original-mail-from'] && returnedhash['From']) {
        this.fbl_hash['Original-mail-from'] = returnedhash['From'];
      }
      if (!this.fbl_hash['Original-rcpt-to'] && this.fbl_hash['Removal-recipient']) {
        this.fbl_hash['Original-rcpt-to'] = this.fbl_hash['Removal-recipient'];
      } else if (returnedhash['To']) {
        this.fbl_hash['Original-rcpt-to'] = returnedhash['To'];
      }

      if (!this.fbl_hash['Original-mail-messageid'] && returnedhash['Message-id']) {
        this.fbl_hash['Original-mail-messageid'] = returnedhash['Message-id'];
      }

    }
    // warning, some servers will remove the name of the original intended recipient from the FBL report,
    // replacing it with redactedrcpt-hostname.com, making it utterly useless, of course (unless you used a web-beacon).
    // here we try our best to give you the actual intended recipient, if possible.
    if (this.fbl_hash['Original-rcpt-to'].match(/Undisclosed|redacted/i) && typeof this.fbl_hash['Removal-recipient'] !== 'undefined') {
      this.fbl_hash['Original-rcpt-to'] = this.fbl_hash['Removal-recipient'];
    }
    if (!this.fbl_hash['Received-date'] && this.fbl_hash['Arrival-date']) {
      this.fbl_hash['Received-date'] = this.fbl_hash['Arrival-date'];
    }
    this.fbl_hash['Original-mail-from'] = this.strip_angle_brackets(this.fbl_hash['Original-mail-from']);
    this.fbl_hash['Original-rcpt-to'] = this.strip_angle_brackets(this.fbl_hash['Original-rcpt-to']);
    this.output[0]['recipient'] = this.fbl_hash['Original-rcpt-to'];
    this.output[0]['messageid'] = this.fbl_hash['Original-mail-messageid'] ? this.fbl_hash['Original-mail-messageid'] : null;
  };

  this.looksLikeAutoReplyAction = function () {
    // looks like a vacation autoreply, ignoring
    this.output[0]['action'] = 'autoreply';
  };

  this.temporaryProblemAction = function (mail) {
    let arrFailed, j;
    // is this an autoresponse ?
    this.output[0]['action'] = 'transient';
    this.output[0]['status'] = '4.3.2';
    // grab the first recipient and break
    this.output[0]['recipient'] = mail.hasHeader('return-path') ? this.strip_angle_brackets(mail.getHeader('return-path')) : '';
    if (this.output[0]['recipient']) {
      arrFailed = this.find_email_addresses(this.body);
      for (j = 0; j < arrFailed.length; j++) {
        this.output[j]['recipient'] = arrFailed[j].trim();
        break;
      }
    }
  };

  this.RFC1892MultipartReportAction = function () {
    let i;
    let rpt_hash = this.parse_machine_parsable_body_part(this.mime_sections['machine_parsable_body_part']);
    let rpt_head = this.get_head_from_returned_message_body_part(this.mime_sections);
    for (i = 0; i < rpt_hash['per_recipient'].length; i++) {
      this.output[i] = {};
      this.output[i]['recipient'] = this.find_recipient(rpt_hash['per_recipient'][i]);
      let mycode = rpt_hash['per_recipient'][i]['Status'] ? this.format_status_code(rpt_hash['per_recipient'][i]['Status']) : '';
      this.output[i]['status'] = mycode['code'] ? mycode['code'].join('.') : '';
      let errorMessage = rpt_hash['per_recipient'][i]['Diagnostic-code']['text'] ? this.format_status_code(rpt_hash['per_recipient'][i]['Diagnostic-code']['text'] ) : ''
      this.output[i]['message'] = errorMessage['text'] ? errorMessage['text'] : ''
      this.output[i]['action'] = rpt_hash['per_recipient'][i]['Action'] ? rpt_hash['per_recipient'][i]['Action'] : '';
      // TODO: Review MessageId associated with each output.
      this.output[i]['messageid'] = rpt_head['MessageId'] ? rpt_head['MessageId'] : '';
    }
  };

  this.failedRecipientAction = function (mail) {
    //  Busted Exim MTA
    //  Up to 50 email addresses can be listed on each header.
    //  There can be multiple X-Failed-Recipients: headers. - (not supported)
    this.setOutput(mail.getHeader('x-failed-recipients').split(/,/));
  };

  this.ohGodItCouldBeAnythingAction = function () {
    // oh god it could be anything, but at least it has mime parts, so let's try anyway
    this.setOutput(this.find_email_addresses(this.mime_sections['first_body_part']));
  };

  this.looksLikeABounceAction = function () {
    // last ditch attempt
    // could possibly produce erroneous output, or be very resource consuming,
    // so be careful.  You should comment out this section if you are very concerned
    // about 100% accuracy or if you want very fast performance.
    // Leave it turned on if you know that all messages to be analyzed are bounces.
    this.setOutput(this.find_email_addresses(this.body));

  };

  this.setOutput = function(list) {
    for (let j = 0; j < list.length; j++) {
      if (typeof this.output[j] === 'undefined') this.output[j] = {};
      this.output[j]['recipient'] = list[j].trim();
      this.output[j]['status'] = this.get_status_code_from_text(this.output[j]['recipient'], 0);
      this.output[j]['action'] = this.get_action_from_status_code(this.output[j]['status']);
      this.output[j]['messageid'] = this.get_messageid_from_text(this.output[j]['recipient'], 0);
    }
  };

  this.code200Action = function () {
    let arrReceiver, j;
    arrReceiver = this.find_email_addresses(this.body);

    for (j = 0; j < arrReceiver.length; j++) {
      if (typeof this.output[j] === 'undefined') this.output[j] = {};
      this.output[j]['recipient'] = arrReceiver[j].trim();
      this.output[j]['status'] = '200';
      this.output[j]['action'] = 'success';
      this.output[j]['messageid'] = this.get_messageid_from_text(this.output[j]['recipient'], 0);
    }
  };

  this.fullCheckResponse = function (mail) {
    let i;
    let boundary = mail.getHeaders().has('content-type') ? mail.getHeader('content-type').params.boundary : undefined;

    switch (true) {
      case this.looks_like_an_FBL:
        this.looksLikeAnFBLAction(mail);
        break;
      case (mail.getHeader('subject').match(/auto.{0,20}reply|vacation|(out|away|on holiday).*office/i)):
        this.looksLikeAutoReplyAction();
        break;
      case this.looks_like_an_autoresponse:
        this.temporaryProblemAction(mail);
        break;
      case this.is_RFC1892_multipart_report(mail):
        this.RFC1892MultipartReportAction();
        break;
      case mail.hasHeader('x-failed-recipients'):
        this.failedRecipientAction(mail);
        break;
      case (typeof (boundary) !== 'undefined' && boundary && this.looks_like_a_bounce):
        this.ohGodItCouldBeAnythingAction();
        break;
      case this.looks_like_a_bounce:
        this.looksLikeABounceAction();
        break;
      default:
        this.code200Action();
        break;

    }

    let tmp = [];
    for (i = 0; i < this.output.length; ++i) {
      let arr = this.output[i];
      if (!arr['recipient'] && !arr['status'] && !arr['action']) {
        continue;
      }
      tmp.push(arr);
    }
    this.output = tmp;

    // accessors
    /*if it is an FBL, you could use the class variables to access the
    data (Unlike Multipart-reports, FBL's report only one bounce)
    */
    this.type = this.find_type();
    this.action = this.output.length ? this.output[0]['action'] : '';
    this.status = this.output.length ? this.output[0]['status'] : '';
    this.recipient = this.output.length ? this.output[0]['recipient'] : '';
    this.messageid = this.output.length ? this.output[0]['messageid'] : '';
    if (this.output && this.output[0]) {
        this.output[0]['is'] = this.simpleCheckResponse();
        return this.output[0];
    }
    return [];
  };

  // this is the most commonly used public method
  // quick and dirty
  // useage: multiArray = this.get_the_facts(strEmail);
  this.parse_email = function (mail, fullCheck) {
    this.body = mail.getBody();

    // parse the email into data structures
    let boundary = mail.getHeaders().has('content-type') ? mail.getHeader('content-type').params.boundary : undefined;
    this.mime_sections = this.parse_body_into_mime_sections(this.body, boundary);
    this.body_hash = this.body.split(/\r\n/);
    this.first_body_hash = this.parse_head(this.mime_sections['first_body_part']);

    this.looks_like_a_bounce = this.is_a_bounce(mail);
    this.looks_like_an_FBL = this.is_an_ARF(mail);
    this.looks_like_an_autoresponse = this.is_an_autoresponse(mail);

    /* If you are trying to save processing power, and don't care much
     * about accuracy then uncomment this statement in order to skip the
     * heroic text parsing below.
     */

    return fullCheck ? this.fullCheckResponse(mail) : {is: this.simpleCheckResponse(mail)};
  };

  // general purpose recursive heuristic function
  // to try to extract useful info from the bounces produced by busted MTAs
  this.get_messageid_from_text = function (recipient, index) {
    let messageid = '';
    let line;
    for (let i = index; i < this.body_hash.length; i++) {
      line = this.body_hash[i].trim();
      if (line.length < 1) {
        continue;
      }

      if (line.toLowerCase().indexOf('Message-ID'.toLowerCase()) === 0) {
        let splits = line.split(':');
        messageid = splits[1].trim();
        break;
      }

      /***** retry bounce email might not have Message-ID instead may have status line *****/
      if (!messageid) {
        let matches = line.match(/message identifier[^:]+:(.*)/);
        if (matches) {
          messageid = matches[1].trim();
        }
      }

    }
    return messageid;
  };

  // general purpose recursive heuristic function
  // to try to extract useful info from the bounces produced by busted MTAs
  this.get_status_code_from_text = function (recipient, index) {
    let line, matches, mycode;

    for (let i = index; i < this.body_hash.length; i++) {
      line = this.body_hash[i].trim();

      /******** recurse into the email if you find the recipient ********/
      if (line.toLowerCase().indexOf(recipient.toLowerCase()) !== -1 && index === 0) {
        // the status code MIGHT be in the next few lines after the recipient line,
        // depending on the message from the foreign host... What a laugh riot!
        let status_code = this.get_status_code_from_text(recipient, i + 1);
        if (status_code) {
          return status_code;
        }
      }

      /******** exit conditions ********/
      // if it's the end of the human readable part in this stupid bounce
      if (line.toLowerCase().indexOf('------ This is a copy of the message'.toLowerCase()) !== -1) {
        return '';
      }
      //if we see an email address other than our current recipient's,
      if (this.find_email_addresses(line).length >= 1 && line.toLowerCase().indexOf(recipient.toLowerCase()) === -1 && line.indexOf('FROM:<') === -1) { // Kanon added this line because Hotmail puts the e-mail address too soon and there actually is error message stuff after it.
        return '';
      }

      /******** pattern matching ********/
      if (line.length) { // a bit-optimized to ignore scanning over blank lines
        for (let bouncetext in this.bouncelist) {
          let bouncecode = this.bouncelist[bouncetext];
          matches = line.match(new RegExp(bouncetext, 'ig'));
          if (matches) {
            return typeof (matches[1]) !== 'undefined' ? matches[1] : bouncecode;
          }
        }
      }


      // rfc1893 return code
      matches = line.match(/\W([245]\.[01234567]\.[012345678])\W/);
      if (matches) {
        if (line.toLowerCase().indexOf('Message-ID'.toLowerCase()) !== -1) {
          break;
        }
        mycode = matches[1].replace(/\./g, '');
        mycode = this.format_status_code(mycode);
        return mycode['code'].join('.');
      }

      // search for RFC821 return code
      // thanks to mark.tolmangmail.com
      // Maybe at some point it should have it's own place within the main parsing scheme (at line 88)
      matches = line.match(/]?: ([45][01257][012345]) /);
      if (!matches) {
        matches = line.match(/^([45][01257][012345]) (?:.*?)(?:denied|inactive|deactivated|rejected|disabled|unknown|no such|not (?:our|activated|a valid))+/i);
      }
      if (matches) {
        mycode = matches[1];
        // map common codes to new rfc values
        if (mycode === '450' || mycode === '550' || mycode === '551' || mycode === '554') {
          mycode = '511';
        } else if (mycode === '452' || mycode === '552') {
          mycode = '422';
        } else if (mycode === '421') {
          mycode = '432';
        }
        mycode = this.format_status_code(mycode);
        return mycode['code'].join('.');
      }

    }
    return '';
  };

  this.is_RFC1892_multipart_report = function (mail) {
    return mail.hasHeader('content-type') &&
      mail.getHeader('content-type').value === 'multipart/report' &&
      mail.getHeader('content-type').params['report-type'] === 'delivery-status' &&
      mail.getHeader('content-type').params['boundary'] !== '';
  };

  this.parse_head = function (headers) {
    if (typeof headers === 'string') headers = headers.split("\r\n");

    let hash = this.standard_parser(headers);
    if (hash['Content-type']) { //preg_match('/Multipart\/Report/i', hash['Content-type'])){
      let multipart_report = hash['Content-type'].split(';');
      hash['Content-type'] = {};
      hash['Content-type']['type'] = multipart_report[0].toLowerCase();
      for (let i = 0; i < multipart_report.length; ++i) {
        let mr = multipart_report[i];
        let matches = mr.match(/([^=.]*?)=(.*)/i);
        if (matches) {
          // didn't work when the content-type boundary ID contained an equal sign,
          // that exists in bounces from many Exchange servers
          //if(preg_match('/([a-z]*)=(.*)?/i', mr, matches)){
          hash['Content-type'][matches[1].trim().toLowerCase()] = matches[2].replace(/"/g, '');
        }
      }
    }
    return hash;
  };

  this.parse_body_into_mime_sections = function (body, boundary) {
    if (!boundary) return [];
    if (typeof body === 'object' && typeof body.length !== 'undefined') body = body.join('\r\n');
    body = body.split(boundary);
    let mime_sections = {};
    mime_sections['first_body_part'] = body[1];
    mime_sections['machine_parsable_body_part'] = body[2];
    mime_sections['returned_message_body_part'] = body[3];
    return mime_sections;
  };


  this.standard_parser = function (content) { // associative array orstr
    let entity;
    // receives email head as array of lines
    // simple parse (Entity: value\n)
    let hash = {
      'Received': ''
    };
    if (typeof content === 'undefined') content = [];
    if (typeof content === 'string') content = content.split('\r\n');

    for (let i = 0; i < content.length; ++i) {
      let line = content[i];
      let array = line.match(/^([^\s.]*):\s*(.*)\s*/);
      if (array) {
        entity = array[1].toLowerCase();
        entity = entity.charAt(0).toUpperCase() + entity.slice(1);

        if (!hash[entity]) {
          hash[entity] = array[2].trim();
        } else if (hash['Received']) {
          // grab extra Received headers :(
          // pile it on with pipe delimiters,
          // oh well, SMTP is broken in this way
          if (entity && array[2] && array[2] !== hash[entity]) {
            hash[entity] += '|' + array[2].trim();
          }
        }
      } else if (line.match(/^\s+(.+)\s*/) && entity) {
        hash[entity] += ' ' + line;
      }
    }
    // special formatting
    hash['Received'] = hash['Recieved'] ? hash['Recieved'].split('|') : '';
    //hash['Subject'] = iconv_mime_decode(hash['Subject'], 0, 'ISO-8859-1'); // REVIEW <<<<

    return hash;
  };

  this.parse_machine_parsable_body_part = function (str) {
    let arr, i;
    //Per-Message DSN fields
    let hash = this.parse_dsn_fields(str);
    hash['mime_header'] = this.standard_parser(hash['mime_header']);
    hash['per_message'] = this.standard_parser(hash['per_message']);
    if (hash['per_message']['X-postfix-sender']) {
      arr = hash['per_message']['X-postfix-sender'].split(';');
      hash['per_message']['X-postfix-sender'] = {};
      hash['per_message']['X-postfix-sender']['type'] = arr[0] ? arr[0].trim() : '';
      hash['per_message']['X-postfix-sender']['addr'] = arr[1] ? arr[1].trim() : '';
    }
    if (hash['per_message']['Reporting-mta']) {
      arr = hash['per_message']['Reporting-mta'].split(';');
      hash['per_message']['Reporting-mta'] = {};
      hash['per_message']['Reporting-mta']['type'] = arr[0] ? arr[0].trim() : '';
      hash['per_message']['Reporting-mta']['addr'] = arr[1] ? arr[1].trim() : '';
    }
    //Per-Recipient DSN fields
    for (i = 0; i < hash['per_recipient'].length; i++) {
      let temp = this.standard_parser(hash['per_recipient'][i].split('\r\n'));
      arr = temp['Final-recipient'] ? temp['Final-recipient'].split(';') : [];
      temp['Final-recipient'] = this.format_final_recipient_array(arr);
      //temp['Final-recipient']['type'] = trim(arr[0]);
      //temp['Final-recipient']['addr'] = trim(arr[1]);
      arr = (temp['Original-recipient']) ? temp['Original-recipient'].split(';') : ['', ''];
      temp['Original-recipient'] = {};
      temp['Original-recipient']['type'] = arr[0] ? arr[0].trim() : '';
      temp['Original-recipient']['addr'] = arr[1] ? arr[1].trim() : '';
      arr = (temp['Diagnostic-code']) ? temp['Diagnostic-code'].split(';') : ['', ''];
      temp['Diagnostic-code'] = {};
      temp['Diagnostic-code']['type'] = arr[0] ? arr[0].trim() : '';
      temp['Diagnostic-code']['text'] = arr[1] ? arr[1].trim() : '';
      // now this is wierd: plenty of times you see the status code is a permanent failure,
      // but the diagnostic code is a temporary failure.  So we will assert the most general
      // temporary failure in this case.
      let ddc = '';
      let judgement = '';
      ddc = this.decode_diagnostic_code(temp['Diagnostic-code']['text']);
      judgement = this.get_action_from_status_code(ddc);
      if (judgement === 'transient') {
        if (temp['Action'].toLowerCase().indexOf('failed') !== -1) {
          temp['Action'] = 'transient';
          temp['Status'] = '4.3.0';
        }
      }
      hash['per_recipient'][i] = temp;
    }
    return hash;
  };

  this.get_head_from_returned_message_body_part = function (mime_sections) {
    let head = {};
    if (mime_sections['returned_message_body_part']) {
      let temp = mime_sections['returned_message_body_part'].split('\r\n\r\n');
      head = this.standard_parser(temp[1]);
      head['From'] = this.extract_address(head['From']);
      head['To'] = this.extract_address(head['To']);
      head['MessageId'] = head['Message-id'];
    }
    return head;
  };

  this.extract_address = function (str) {
    let from_stuff = str ? str.split(/[ \"\'\<\>:\(\)\[\]]/) : [];
    let from = null;
    for (let i = 0; i < from_stuff.length; ++i) {
      let things = from_stuff[i];
      if (things.indexOf('@') !== -1) {
        from = things;
      }
    }
    return from;
  };

  this.find_recipient = function (per_rcpt) {
    let recipient = '';
    if (per_rcpt['Original-recipient'] && per_rcpt['Original-recipient']['addr'] !== '') {
      recipient = per_rcpt['Original-recipient']['addr'];
    } else if (per_rcpt['Final-recipient'] && per_rcpt['Final-recipient']['addr'] !== '') {
      recipient = per_rcpt['Final-recipient']['addr'];
    }
    recipient = this.strip_angle_brackets(recipient);
    return recipient;
  };

  this.find_type = function () {
    if (this.looks_like_a_bounce)
      return 'bounce';
    else if (this.looks_like_an_FBL)
      return 'fbl';
    else
      return false;
  };

  this.parse_dsn_fields = function (dsn_fields) {
    if (typeof dsn_fields === 'undefined') dsn_fields = [];
    else if (typeof dsn_fields === 'string') dsn_fields = dsn_fields.split(/\r\n\r\n/g);
    let j = 0;
    let hash = {
      'per_message': '',
      'per_recipient': []
    };
    for (let i = 0; i < dsn_fields.length; i++) {
      dsn_fields[i] = dsn_fields[i].trim();
      if (i === 0)
        hash['mime_header'] = dsn_fields[0];
      else if (i === 1 && !dsn_fields[1].match(/(Final|Original)-Recipient/)) {
        // some mta's don't output the per_message part, which means
        // the second element in the array should really be
        // per_recipient - test with Final-Recipient - which should always
        // indicate that the part is a per_recipient part
        hash['per_message'] = dsn_fields[1];
      } else {
        if (dsn_fields[i] === '--') continue;
        hash['per_recipient'][j] = dsn_fields[i];
        j++;
      }
    }
    return hash;
  };

  this.format_status_code = function (code) {
    code = (code || '').toString();
    let ret = {};
    let matches = code.match(/([245])\.([01234567])\.([012345678])(.*)/);
    if (matches) {
      ret['code'] = [matches[1], matches[2], matches[3]];
      ret['text'] = matches[4];
    } else {
      matches = code.match(/([245])([01234567])([012345678])(.*)/);
      if (matches) {
        ret['code'] = [matches[1], matches[2], matches[3]];
        ret['text'] = matches[4];
      }
    }
    return ret;
  };

  this.fetch_status_messages = function (code) {
    let rfc1893 = require('./rfc1893-error-codes');
    let ret = this.format_status_code(code);
    let arr = ret['code'].split('.');
    let str = '<P><B>' + rfc1893.status_code_classes[arr[0]]['title'] + '</B> - ' + rfc1893.status_code_classes[arr[0]]['descr'] + '  <B>' + rfc1893.status_code_subclasses[arr[1] + '.' + arr[2]]['title'] + '</B> - ' + rfc1893.status_code_subclasses[arr[1] + '.' + arr[2]]['descr'] + '</P>';
    return str;
  };

  this.get_action_from_status_code = function (code) {
    if (code === '') return '';
    let ret = this.format_status_code(code);
    let stat = ret['code'] ? parseInt(ret['code'][0], 10) : null;
    switch (stat) {
      case (2):
        return 'success';
      case (4):
        return 'transient';
      case (5):
        return 'failed';
      default:
        return 'unknown';
    }
  };

  this.decode_diagnostic_code = function (dcode) {
    if (!dcode) return '';
    dcode = (dcode || '').toString();
    let array = dcode.match(/(\d\.\d\.\d)\s/);
    if (array) {
      return array[1];
    } else {
      array = dcode.match(/(\d\d\d)\s/);
      if (array) {
        return array[1];
      }
    }
  };

  this.is_a_bounce = function (mail) {
    if (mail.hasHeader('subject') && mail.getHeader('subject').match(/(mail delivery failed|failure notice|warning: message|delivery status notif|delivery failure|delivery problem|spam eater|undeliverable|returned mail|delivery errors|mail status report|mail system error|failure delivery|delivery notification|delivery has failed|undelivered mail|returned email|returning message to sender|returned to sender|message delayed|mdaemon notification|mailserver notification|mail delivery system|nondeliverable mail|mail transaction failed)|auto.{0,20}reply|vacation|(out|away|on holiday).*office/i)) return true;
    if (mail.hasHeader('precedence') && mail.getHeader('precedence').match(/auto_reply/)) return true;

    if (mail.hasHeader('from') && mail.getHeader('from').match(/^(postmaster|mailer-daemon)\@?/i)) {
      return true
    }

    return false;
  };

  this.find_email_addresses = function (first_body_part) {
    // not finished yet.  This finds only one address.
    first_body_part = (first_body_part || '').toString();
    let matches = first_body_part.match(/\b([A-Z0-9._%-]+@[A-Z0-9.-]+\.[A-Z]{2,4})\b/i);
    if (matches) {
      return [matches[1]];
    } else
      return [];
  };


  // these functions are for feedback loops
  this.is_an_ARF = function (mail) {
    if (mail.hasHeader('content-type') && mail.getHeader('content-type').params['report-type'] && mail.getHeader('content-type').params['report-type'].match(/feedback-report/)) return true;
    if (mail.hasHeader('x-loop') && mail.getHeader('x-loop').match(/scomp/)) return true;
    if (mail.hasHeader('x-hmxmroriginalrecipient')) {
      this.is_hotmail_fbl = true;
      this.recipient = mail.getHeader('x-hmxmroriginalrecipient');
      return true;
    }
    if (typeof this.first_body_hash['X-hmxmroriginalrecipient'] !== 'undefined') {
      this.is_hotmail_fbl = true;
      this.recipient = this.first_body_hash['X-hmxmroriginalrecipient'];
      return true;
    }
    return false;
  };

  // look for common auto-responders
  this.is_an_autoresponse = function (mail) {
    let subj = libmime.decodeWords(mail.getHeader('subject'));
    for (let i = 0; i < this.autorespondlist.length; ++i) {
      let a = this.autorespondlist[i];
      if (subj.match(new RegExp("/" + a + "/", "i"))) {
        this.autoresponse = mail.getHeader('subject');
        return true;
      }
    }
    return false;
  };

  this.strip_angle_brackets = function (recipient) {
    if (!recipient) return recipient;
    recipient = recipient.replace(/</g, '');
    recipient = recipient.replace(/>/g, '');
    return recipient.trim();
  };


  /*The syntax of the final-recipient field is as follows:
  "Final-Recipient" ":" address-type ";" generic-address
  */
  this.format_final_recipient_array = function (arr) {
    let output = {
      'addr': '',
      'type': ''
    };
    if (arr.length) {
      if (arr[0].indexOf('@') !== -1) {
        output['addr'] = this.strip_angle_brackets(arr[0]);
        output['type'] = (arr[1]) ? arr[1].trim() : 'unknown';
      } else {
        output['type'] = arr[0].trim();
        output['addr'] = this.strip_angle_brackets(arr[1]);
      }
    }

    return output;
  };
}

/** END class MailBounceSnoop **/

exports.MailBounceSnoop = MailBounceSnoop;
