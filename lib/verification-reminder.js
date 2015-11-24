/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var config = require('../config').verificationReminder

module.exports = function (log) {

  var SQSReceiver = require('./sqs')(log)

  return function start(config) {

    function handleReminder(message) {
      console.log(message)
      // TODO...
      message.del()
    }

    var verifyQueue = new SQSReceiver(config.region, [config.queueUrl])
    verifyQueue.on('data', handleReminder)
    verifyQueue.start()
    return verifyQueue
  }
}