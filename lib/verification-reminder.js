/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var log = require('../log')('verification-reminder')

module.exports = function () {
  var SQSReminderReceiver = require('./sqs-reminder')()

  return function start(mailer) {

    function handleReminder(message) {
      log.debug('handleReminder', message)
      // TODO: account status check
      var accountVerified = false
      if (! accountVerified) {
        mailer.verificationReminderEmail(message)
        // TODO: queue up second email if we need to send it again.
      }
      // TODO: check createdAt date
      message.del()
    }

    var verifyQueue = new SQSReminderReceiver()
    verifyQueue.on('data', function (message) {
      process.nextTick(function() {
        handleReminder(message)
      })
    })
    verifyQueue.start()
    return verifyQueue
  }
}