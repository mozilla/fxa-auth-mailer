/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var AWS = require('aws-sdk')
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter

var log = require('../log')('sqs-reminder')
var reminderConfig = require('../config').get('verificationReminder')

module.exports = function () {
  // based on sqs.js code in fxa-auth-server
  function SQSReminderReceiver() {
    this.sqs = new AWS.SQS({ region : reminderConfig.queueRegion })
    this.queueUrl = reminderConfig.queueUrl
    EventEmitter.call(this)
  }
  // add support for EventEmitter events
  inherits(SQSReminderReceiver, EventEmitter)

  /**
   * Fetch messages from the reminder queue
   */
  SQSReminderReceiver.prototype.fetch = function () {
    var errTimer = null
    var self = this
    var url = this.queueUrl

    this.sqs.receiveMessage(
      {
        QueueUrl: url,
        AttributeNames: [],
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2
      },
      function (err, data) {
        if (err) {
          log.error('fetch', { url: url, err: err })
          if (! errTimer) {
            // the aws lib might call the callback
            // more than once with different errors.
            errTimer = setTimeout(this.fetch.bind(this), 2000)
          }
          return
        }

        data.Messages = data.Messages || []
        log.debug('fetch', url, data)
        for (var i = 0; i < data.Messages.length; i++) {
          // get the message
          var msg = data.Messages[i]
          var deleteFromQueue = self.deleteMessage.bind(this, msg)


          try {
            var message = JSON.parse(msg.Body)
            message.del = deleteFromQueue

            // validate message
            if (message.email && message.code && message.acceptLanguage && message.uid) {
              // delay any other processing by 'visibilityTimeout'
              self.delayMessage(msg.ReceiptHandle)
              this.emit('data', message)
            } else {
              deleteFromQueue()
            }

          }
          catch (e) {
            log.error('fetch.messages', { url: url, err: e })
            // delete from queue if message cannot be parsed
            deleteFromQueue()
          }
        }

        // fetch the queue again
        this.fetch()
      }.bind(this)
    )
  }

  /**
   * Delay other processing of this reminder queue message
   * @param receiptHandle
   */
  SQSReminderReceiver.prototype.delayMessage = function (receiptHandle) {
    if (receiptHandle) {
      var params = {
        QueueUrl: this.queueUrl, /* required */
        ReceiptHandle: receiptHandle, /* required */
        VisibilityTimeout: reminderConfig.visibilityTimeout /* required */
      }

      this.sqs.changeMessageVisibility(params, function(err) {
        if (err) {
          log.error('delayMessage', {err: err})
        }
      })
    }
  }

  /**
   * Start fetching from the queue
   */
  SQSReminderReceiver.prototype.start = function () {
    this.fetch()
  }

  /**
   * Delete the message from the queue
   * @param message
   */
  SQSReminderReceiver.prototype.deleteMessage = function (message) {
    this.sqs.deleteMessage(
      {
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle
      },
      function (err) {
        if (err) {
          log.error('deleteMessage', {err: err})
        }
      }
    )
  }

  return SQSReminderReceiver
}
