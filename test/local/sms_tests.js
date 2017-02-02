/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const P = require('bluebird')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const test = require('tap').test

const log = { info: sinon.spy() }

const sendSms = sinon.spy((data, callback) => {
  callback()
})
function Nexmo () {}
Nexmo.prototype.message = { sendSms }

P.all([
  require('../../translator')(['en'], 'en'),
  require('../../templates')()
]).spread((translator, templates) => {
  const sms = proxyquire('../../lib/sms', {
    nexmo: Nexmo
  })(log, translator, templates, {
    apiKey: 'foo',
    apiSecret: 'bar',
    from: {
      alphanumeric: 'baz',
      virtualNumber: '1234567890'
    }
  })

  test('interface is correct', t => {
    t.equal(typeof sms.send, 'function', 'sms.send is function')
    t.equal(sms.send.length, 1, 'sms.send expects 1 argument')
    t.equal(Object.keys(sms).length, 1, 'sms has no other methods')
    t.done()
  })

  test('send a valid sms to north america', t => {
    t.plan(4)
    return sms.send({
      phoneNumber: '+18885083401',
      messageId: 1,
      acceptLanguage: 'en'
    })
    .then(() => {
      t.equal(sendSms.callCount, 1, 'nexmo.message.sendSms was called once')
      t.equal(sendSms.args[0].length, 2, 'nexmo.message.sendSms was passed two arguments')
      t.deepEqual(sendSms.args[0][0], {
        from: '1234567890',
        to: '+18885083401',
        type: 'text',
        text: 'As requested, here is your link to install Firefox on your mobile device: https://moz.la/vwxyz'
      }, 'nexmo.message.sendSms was passed the correct data')
      t.equal(typeof sendSms.args[0][1], 'function', 'nexmo.message.sendSms was passed a callback function')
    })
    .finally(() => sendSms.reset())
  })

  test('send a valid sms to the uk', t => {
    t.plan(2)
    return sms.send({
      phoneNumber: '+442078553000',
      messageId: 1,
      acceptLanguage: 'en'
    })
    .then(() => {
      t.equal(sendSms.callCount, 1, 'nexmo.message.sendSms was called once')
      t.deepEqual(sendSms.args[0][0], {
        from: 'baz',
        to: '+442078553000',
        type: 'text',
        text: 'As requested, here is your link to install Firefox on your mobile device: https://moz.la/vwxyz'
      }, 'nexmo.message.sendSms was passed the correct data')
    })
    .finally(() => sendSms.reset())
  })

  test('try to send an sms to an invalid phone number', t => {
    t.plan(3)
    return sms.send({
      phoneNumber: '+15551234567',
      messageId: 1,
      acceptLanguage: 'en'
    })
    .then(() => t.notOk(true, 'sms.send should have rejected'))
    .catch(err => {
      t.equal(sendSms.callCount, 0, 'nexmo.message.sendSms was not called')
      t.equal(err.code, 400, 'err.code was set correctly')
      t.equal(err.message, 'Invalid phone number "+15551234567"')
    })
  })

  test('try to send an sms to an invalid region', t => {
    t.plan(3)
    return sms.send({
      phoneNumber: '+886287861100',
      messageId: 1,
      acceptLanguage: 'en'
    })
    .then(() => t.notOk(true, 'sms.send should have rejected'))
    .catch(err => {
      t.equal(sendSms.callCount, 0, 'nexmo.message.sendSms was not called')
      t.equal(err.code, 400, 'err.code was set correctly')
      t.equal(err.message, 'Invalid region "TW"')
    })
  })

  test('try to send an sms with an invalid message id', t => {
    t.plan(3)
    return sms.send({
      phoneNumber: '+18885083401',
      messageId: 2,
      acceptLanguage: 'en'
    })
    .then(() => t.notOk(true, 'sms.send should have rejected'))
    .catch(err => {
      t.equal(sendSms.callCount, 0, 'nexmo.message.sendSms was not called')
      t.equal(err.code, 400, 'err.code was set correctly')
      t.equal(err.message, 'Invalid message id "2"')
    })
  })
})

