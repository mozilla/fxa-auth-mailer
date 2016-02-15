/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var test = require('tap').test

var nullLog = {
  trace: function () {},
  info: function () {}
}

var config = require('../../config')
var VerificationReminder = require('../../lib/verification-reminder')(nullLog)

test(
  'constuctor',
  function (t) {
    var reminder = new VerificationReminder(config)
  }
)
