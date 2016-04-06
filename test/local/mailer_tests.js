/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var P = require('bluebird')
var test = require('tap').test

var nullLog = {
  trace: function () {},
  info: function () {}
}

var config = require('../../config')
var Mailer = require('../../mailer')(nullLog)

var messageTypes = [
  'verifyEmail',
  'recoveryEmail',
  'unlockEmail',
  'passwordChangedEmail',
  'passwordResetEmail',
  'newDeviceLoginEmail',
  'postVerifyEmail',
  'verificationReminderEmail'
]

P.all(
  [
    require('../../translator')(['en'], 'en'),
    require('../../templates')()
  ]
)
.spread(
  function (translator, templates) {

    messageTypes.forEach(
      function (type) {
        var mailer = new Mailer(translator, templates, config.get('mail'))

        var message = {
          email: 'a@b.com',
          uid: 'uid',
          code: 'abc123',
          service: 'service',
        }

        var supportHtmlLink = new RegExp('<a href="' + config.get('mail').supportUrl + '" style="color: #0095dd; text-decoration: none; font-family: sans-serif;">Mozilla Support</a>')
        var supportTextLink = config.get('mail').supportUrl

        test(
          'test support link is in email template output for ' + type,
          function (t) {
            mailer.mailer.sendMail = function (emailConfig) {
              t.equal(!! emailConfig.html.match(supportHtmlLink), true)
              t.equal(!! emailConfig.text.match(supportTextLink), true)
              t.end()
            }
            mailer[type](message)
          }
        )

        if (type === 'postVerifyEmail') {
          test(
            'test utm params for ' + type,
            function (t) {
              var utmParam = '?utm_source=email&utm_medium=email&utm_campaign=fx-account-verified'

              mailer.mailer.sendMail = function (emailConfig) {
                t.ok(emailConfig.html.indexOf(config.get('mail').androidUrl + utmParam) > 0)
                t.ok(emailConfig.html.indexOf(config.get('mail').iosUrl + utmParam) > 0)
                t.ok(emailConfig.html.indexOf(config.get('mail').syncUrl + utmParam) > 0)
                t.end()
              }
              mailer[type](message)
            }
          )
        }

      }
    )

    test(
      'test user-agent info rendering',
      function (t) {
        var mailer = new Mailer(translator, templates, config.get('mail'))

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: 'Firefox',
          uaBrowserVersion: '32',
          uaOS: 'Windows',
          uaOSVersion: '8.1'
        }), 'Firefox 32, Windows 8.1')

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: 'Chrome',
          uaBrowserVersion: undefined,
          uaOS: 'Windows',
          uaOSVersion: '10',
        }), 'Chrome, Windows 10')

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: undefined,
          uaBrowserVersion: '12',
          uaOS: 'Windows',
          uaOSVersion: '10'
        }), 'Windows 10')

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: 'MSIE',
          uaBrowserVersion: '6',
          uaOS: 'Linux',
          uaOSVersion: '9'
        }), 'MSIE 6, Linux 9')

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: 'MSIE',
          uaBrowserVersion: undefined,
          uaOS: 'Linux',
          uaOSVersion: undefined
        }), 'MSIE, Linux')

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: 'MSIE',
          uaBrowserVersion: '8',
          uaOS: undefined,
          uaOSVersion: '4'
        }), 'MSIE 8')

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: 'MSIE',
          uaBrowserVersion: undefined,
          uaOS: undefined,
          uaOSVersion: undefined
        }), 'MSIE')

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: undefined,
          uaBrowserVersion: undefined,
          uaOS: 'Windows',
          uaOSVersion: undefined
        }), 'Windows')

        t.equal(mailer._formatUserAgentInfo({
          uaBrowser: undefined,
          uaBrowserVersion: undefined,
          uaOS: undefined,
          uaOSVersion: undefined
        }), '')

        t.end()
      }
    )

  }
)

