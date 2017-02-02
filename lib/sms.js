/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const libpn = require('google-libphonenumber')
const Nexmo = require('nexmo')
const P = require('bluebird')
const SENDER_IDS = new Map(require('./sms-sender-ids.json'))

module.exports = (log, translator, templates, config) => {
  const nexmo = new Nexmo({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret
  })
  const sendSms = P.promisify(nexmo.message.sendSms, { context: nexmo.message })

  // TODO: Sort out the real link
  const LINK = 'https://moz.la/vwxyz'

  return {
    send (body) {
      log.info('sms.send', {
        phoneNumber: body.phoneNumber,
        messageId: body.messageId,
        acceptLanguage: body.acceptLanguage
      })

      return P.resolve()
        .then(() => {
          const senderId = getSenderId(body.phoneNumber)
          const message = getMessage(body.messageId, body.acceptLanguage)

          return sendSms(senderId, body.phoneNumber, message.trim())
        })
        .then(result => {
          const resultCount = result.messages && result.messages.length
          if (resultCount !== 1) {
            log.error('sms.send', { err: new Error('Unexpected result count'), result })
          }

          result = result.messages[0]
          const status = result.status

          if (status !== '0') {
            fail(`Delivery failed: ${status} ${result['error-text']}`, 500)
          }
        })
    }
  }

  function getSenderId (phoneNumber) {
    const numberUtil = libpn.PhoneNumberUtil.getInstance()
    const parsedNumber = numberUtil.parse(phoneNumber)

    if (! numberUtil.isValidNumber(parsedNumber)) {
      fail(`Invalid phone number "${phoneNumber}"`)
    }

    const region = numberUtil.getRegionCodeForNumber(parsedNumber)
    const senderId = SENDER_IDS.get(region)

    if (! senderId) {
      fail(`Invalid region "${region}"`)
    }

    return senderId
  }

  function fail (message, status) {
    const error = new Error(message)
    error.statusCode = status || 400
    throw error
  }

  function getMessage (messageId, acceptLanguage) {
    const template = templates[`sms.${messageId}`]

    if (! template) {
      fail(`Invalid message id "${messageId}"`)
    }

    return template({
      link: LINK,
      translator: translator(acceptLanguage)
    }).text
  }
}
