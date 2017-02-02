#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const config = require('../config')
const P = require('bluebird')
const log = require('../log')('send-sms')

const smsConfig = config.get('sms')
const NOT_SET = 'YOU MUST CHANGE ME'

if (smsConfig.apiKey === NOT_SET || smsConfig.apiSecret === NOT_SET) {
  console.error('This isn\'t going to work.')
  process.exit(1)
}

if (process.argv.length !== 3) {
  console.error(`Usage: ${process.argv[1]} <phoneNumber>`)
  process.exit(1)
}

const phoneNumber = process.argv[2]

P.all([
  require('../translator')(['en'], 'en'),
  require('../templates')()
]).spread((translator, templates) => {
  const sms = require('../lib/sms')(log, translator, templates, smsConfig)
  sms.send({
    phoneNumber,
    messageId: 1,
    acceptLanguage: 'en'
  }).then(result => {
    console.log('SENT!')
  }).catch(error => {
    console.error(error)
  })
})

