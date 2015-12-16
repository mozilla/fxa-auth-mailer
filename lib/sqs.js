/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var AWS = require('aws-sdk')
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter

module.exports = function (log) {

  // based on sqs.js code in fxa-auth-server
  function SQSReceiver(region, urls) {
    this.sqs = new AWS.SQS({ region : region })
    this.queueUrls = urls || []
    EventEmitter.call(this)
  }
  inherits(SQSReceiver, EventEmitter)

  function checkDeleteError(err) {
    if (err) {
      log.error({ op: 'deleteMessage', err: err })
    }
  }

  SQSReceiver.prototype.fetch = function (url) {
    console.log('fetch')
    var errTimer = null
    this.sqs.receiveMessage(
      {
        QueueUrl: url,
        AttributeNames: [],
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2
      },
      function (err, data) {
        console.log(err, data);
        if (err) {
          log.error({ op: 'fetch', url: url, err: err })
          if (!errTimer) {
            // unacceptable! this aws lib will call the callback
            // more than once with different errors. ಠ_ಠ
            errTimer = setTimeout(this.fetch.bind(this, url), 2000)
          }
          return
        }

        data.Messages = data.Messages || []
        for (var i = 0; i < data.Messages.length; i++) {
          var msg = data.Messages[i]
          var body;
          try {
            body = JSON.parse(msg.Body)
          }
          catch (e) {
            log.error({ op: 'fetch', url: url, err: e })
          }

          if (! body) {
            return;
          }

          console.log(msg.ReceiptHandle)
          this.delayMessage(msg.ReceiptHandle, url)
          this.emit('data', body)

        }
        this.fetch(url)
      }.bind(this)
    )
  }

  SQSReceiver.prototype.delayMessage = function (receiptHandle, url) {
    if (receiptHandle) {
      var params = {
        QueueUrl: url, /* required */
        ReceiptHandle: receiptHandle, /* required */
        VisibilityTimeout: 60 /* required */
      };
      this.sqs.changeMessageVisibility(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else     console.log(data);           // successful response
      });
    }
  }

  SQSReceiver.prototype.start = function () {
    for (var i = 0; i < this.queueUrls.length; i++) {
      this.fetch(this.queueUrls[i])
    }
  }

  return SQSReceiver
}
