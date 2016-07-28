/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var qs = require('querystring')
var P = require('bluebird')
var nodemailer = require('nodemailer')

module.exports = function (log) {
  // Email template to UTM campaign map
  var templateNameToCampaignMap = {
    'passwordResetRequiredEmail': 'password-reset-required',
    'passwordChangedEmail': 'password-changed-success',
    'passwordResetEmail': 'password-reset',
    'postVerifyEmail': 'account-verified',
    'newDeviceLoginEmail': 'new-device-signin',
    'resetEmail': 'reset-account',
    'suspiciousLocationEmail': 'suspicious-location',
    'verifyEmail': 'welcome',
    'verifyLoginEmail': 'new-signin',
    'verificationReminderFirstEmail': 'hello-again',
    'verificationReminderSecondEmail': 'still-there',
    'verificationReminderEmail': 'hello-again'
  }
  var utmPrefix = 'fxa-'

  function extend(target, source) {
    for (var key in source) {
      target[key] = source[key]
    }

    return target
  }

  // helper used to ensure strings are extracted
  function gettext(txt) {
    return txt
  }

  function linkAttributes(url) {
    // Not very nice to have presentation code in here, but this is to help l10n
    // contributors not deal with extraneous noise in strings.
    return 'href="' + url + '" style="color: #0095dd; text-decoration: none; font-family: sans-serif;"'
  }


  function Mailer(translator, templates, config, sender) {
    var options = {
      host: config.host,
      secureConnection: config.secure,
      port: config.port
    }

    if (config.user && config.password) {
      options.auth = {
        user: config.user,
        pass: config.password
      }
    }

    this.mailer = sender || nodemailer.createTransport('SMTP', options)
    this.sender = config.sender
    this.verificationUrl = config.verificationUrl
    this.verifyLoginUrl = config.verifyLoginUrl
    this.initiatePasswordResetUrl = config.initiatePasswordResetUrl
    this.initiatePasswordChangeUrl = config.initiatePasswordChangeUrl
    this.passwordResetUrl = config.passwordResetUrl
    this.syncUrl = config.syncUrl
    this.androidUrl = config.androidUrl
    this.iosUrl = config.iosUrl
    this.supportUrl = config.supportUrl
    this.signInUrl = config.signInUrl
    this.privacyUrl = config.privacyUrl
    this.translator = translator
    this.templates = templates
  }

  Mailer.prototype.stop = function () {
    this.mailer.close()
  }

  Mailer.prototype._supportLinkAttributes = function (template) {
    return linkAttributes(this.createSupportLink(template))
  }

  Mailer.prototype._passwordResetLinkAttributes = function (email, template) {
    return linkAttributes(this.createPasswordResetLink(email, template))
  }

  Mailer.prototype._passwordChangeLinkAttributes = function (email, template) {
    return linkAttributes(this.createPasswordChangeLink(email, template))
  }

  Mailer.prototype._formatUserAgentInfo = function (message) {
    // Build a first cut at a device description,
    // without using any new strings.
    // Future iterations can localize this better.
    var parts = []
    if (message.uaBrowser) {
      var browser = message.uaBrowser
      if (message.uaBrowserVersion) {
        browser += ' ' + message.uaBrowserVersion
      }
      parts.push(browser)
    }
    if (message.uaOS) {
      var os = message.uaOS
      if (message.uaOSVersion) {
        os += ' ' + message.uaOSVersion
      }
      parts.push(os)
    }
    return parts.join(', ')
  }

  Mailer.prototype.localize = function (message) {
    var translator = this.translator(message.acceptLanguage)

    var localized = this.templates[message.template](extend({
      translator: translator
    }, message.templateValues))

    return {
      html: localized.html,
      language: translator.language,
      subject: translator.gettext(message.subject),
      text: localized.text
    }
  }

  Mailer.prototype.send = function (message) {
    log.trace({ op: 'mailer.' + message.template, email: message.email, uid: message.uid })

    var localized = this.localize(message)

    var emailConfig = {
      sender: this.sender,
      to: message.email,
      subject: localized.subject,
      text: localized.text,
      html: localized.html,
      headers: extend({
        'Content-Language': localized.language
      }, message.headers)
    }

    log.info({
      email: message.email,
      op: 'mailer.send',
      template: message.template
    })

    var d = P.defer()
    this.mailer.sendMail(
      emailConfig,
      function (err, status) {
        log.trace(
          {
            op: 'mailer.send.1',
            err: err && err.message,
            status: status && status.message,
            id: status && status.messageId
          }
        )
        return err ? d.reject(err) : d.resolve(status)
      }
    )
    return d.promise
  }

  Mailer.prototype.verifyEmail = function (message) {
    log.trace({ op: 'mailer.verifyEmail', email: message.email, uid: message.uid })

    var template = 'verifyEmail'
    var query = {
      uid: message.uid,
      code: message.code
    }

    if (message.service) { query.service = message.service }
    if (message.redirectTo) { query.redirectTo = message.redirectTo }
    if (message.resume) { query.resume = message.resume }

    var link = this._generateUTMLink(this.verificationUrl, query, template, 'activate')
    var alternativeLink = this._generateUTMLink(this.verificationUrl, query, template, 'activate-alternative')

    query.one_click = true
    var oneClickLink = this._generateUTMLink(this.verificationUrl, query, template, 'activate-oneclick')

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link,
        'X-Service-ID': message.service,
        'X-Uid': message.uid,
        'X-Verify-Code': message.code
      },
      subject: gettext('Verify your Firefox Account'),
      template: template,
      templateValues: {
        alternativeLink: alternativeLink,
        email: message.email,
        link: link,
        oneClickLink: oneClickLink,
        privacyUrl: this.createPrivacyLink(template, 'privacy'),
        supportUrl: this.createSupportLink(template),
        supportLinkAttributes: this._supportLinkAttributes(template, 'support')
      },
      uid: message.uid
    })
  }

  Mailer.prototype.verifyLoginEmail = function (message) {
    log.trace({ op: 'mailer.verifyLoginEmail', email: message.email, uid: message.uid })

    var template = 'verifyLoginEmail'
    var query = {
      code: message.code,
      uid: message.uid
    }

    if (message.service) { query.service = message.service }
    if (message.redirectTo) { query.redirectTo = message.redirectTo }
    if (message.resume) { query.resume = message.resume }

    var link = this._generateUTMLink(this.verifyLoginUrl, query, template, 'confirm-signin')
    var alternativeLink = this._generateUTMLink(this.verifyLoginUrl, query, template, 'confirm-signin-alternative')

    query.one_click = true
    var oneClickLink = this._generateUTMLink(this.verifyLoginUrl, query, template, 'confirm-signin-oneclick')

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link,
        'X-Service-ID': message.service,
        'X-Uid': message.uid,
        'X-Verify-Code': message.code
      },
      subject: gettext('Confirm new sign-in to Firefox'),
      template: template,
      templateValues: {
        alternativeLink: alternativeLink,
        device: this._formatUserAgentInfo(message),
        email: message.email,
        link: link,
        oneClickLink: oneClickLink,
        passwordChangeLink: this.createPasswordChangeLink(message.email, template, 'change-password'),
        passwordChangeLinkAttributes: this._passwordChangeLinkAttributes(message.email, template, 'change-password'),
        privacyUrl: this.createPrivacyLink(template, 'privacy'),
        supportLinkAttributes: this._supportLinkAttributes(template, 'support'),
        supportUrl: this.createSupportLink(template)
      },
      uid: message.uid
    })
  }

  Mailer.prototype.recoveryEmail = function (message) {
    // TODO: There seems to be some discrepancy in email template names, some places
    // it is `recoveryEmail` others it is `resetEmail`
    var template = 'resetEmail'
    var query = {
      token: message.token,
      code: message.code,
      email: message.email
    }
    if (message.service) { query.service = message.service }
    if (message.redirectTo) { query.redirectTo = message.redirectTo }
    if (message.resume) { query.resume = message.resume }

    var link = this._generateUTMLink(this.passwordResetUrl, query, template, 'reset-password')
    var alternativeLink = this._generateUTMLink(this.passwordResetUrl, query, template, 'reset-password-alternative')

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link,
        'X-Recovery-Code': message.code
      },
      subject: gettext('Reset your Firefox Account password'),
      template: template,
      templateValues: {
        alternativeLink: alternativeLink,
        code: message.code,
        email: message.email,
        link: link,
        privacyUrl: this.createPrivacyLink('recoveryEmail', 'privacy'),
        signInUrl: this.createSignInLink(message.email, 'recoveryEmail', 'remember-password'),
        supportUrl: this.createSupportLink('recoveryEmail'),
        supportLinkAttributes: this._supportLinkAttributes('recoveryEmail', 'support')
      },
      uid: message.uid
    })
  }

  Mailer.prototype.passwordChangedEmail = function (message) {
    var template = 'passwordChangedEmail'
    var link = this.createPasswordResetLink(message.email, template, 'reset-password')

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link
      },
      subject: gettext('Your Firefox Account password has been changed'),
      template: template,
      templateValues: {
        privacyUrl: this.createPrivacyLink(template, 'privacy'),
        resetLink: link,
        resetLinkAttributes: this._passwordResetLinkAttributes(message.email, template, 'reset-password'),
        supportLinkAttributes: this._supportLinkAttributes(template, 'support'),
        supportUrl: this.createSupportLink(template)
      },
      uid: message.uid
    })
  }

  Mailer.prototype.passwordResetEmail = function (message) {
    var template = 'passwordResetEmail'
    var link = this.createPasswordResetLink(message.email, template, 'reset-password')

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link
      },
      subject: gettext('Your Firefox Account password has been reset'),
      template: 'passwordResetEmail',
      templateValues: {
        privacyUrl: this.createPrivacyLink(template, 'privacy'),
        resetLink: link,
        resetLinkAttributes: this._passwordResetLinkAttributes(message.email, template, 'reset-password'),
        supportUrl: this.createSupportLink(template),
        supportLinkAttributes: this._supportLinkAttributes(template, 'support')
      },
      uid: message.uid
    })
  }

  Mailer.prototype.passwordResetRequiredEmail = function (message) {
    var template = 'passwordResetRequiredEmail'
    var link = this.createPasswordResetLink(message.email, template, 'reset-password')

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link
      },
      subject: gettext('Firefox Account password reset required'),
      template: template,
      templateValues: {
        privacyUrl: this.createPrivacyLink(template, 'privacy'),
        resetLink: link
      },
      uid: message.uid
    })
  }

  Mailer.prototype.newDeviceLoginEmail = function (message) {
    log.trace({ op: 'mailer.newDeviceLoginEmail', email: message.email, uid: message.uid })
    var template = 'newDeviceLoginEmail'
    var link = this.createPasswordChangeLink(message.email, template)

    // Make a human-readable timestamp string.
    // For now it's always in UTC.
    // Future iterations can localize this better.
    var timestamp = new Date(message.timestamp || Date.now())
    var timestampStr = timestamp.toISOString().substr(0, 16).replace('T', ' ') + ' UTC'

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link
      },
      subject: gettext('New sign-in to Firefox'),
      template: template,
      templateValues: {
        device: this._formatUserAgentInfo(message),
        passwordChangeLinkAttributes: this._passwordChangeLinkAttributes(message.email, template),
        privacyUrl: this.createPrivacyLink(template),
        resetLink: link,
        supportLinkAttributes: this._supportLinkAttributes(template),
        supportUrl: this.createSupportLink(template),
        timestamp: timestampStr
      },
      uid: message.uid
    })
  }

  Mailer.prototype.postVerifyEmail = function (message) {
    log.trace({ op: 'mailer.postVerifyEmail', email: message.email, uid: message.uid })

    var template = 'postVerifyEmail'
    // special utm params, just for this email
    // details at github.com/mozilla/fxa-auth-mailer/issues/110
    var query = {
      'utm_campaign': 'fx-account-verified'
    }

    var link = this._generateUTMLink(this.syncUrl, query, template, 'connect-device')
    var alternativeLink = this._generateUTMLink(this.syncUrl, query, template, 'connect-device-alternative')
    var androidLink = this._generateUTMLink(this.androidUrl, query, template, 'connect-android')
    var iosLink = this._generateUTMLink(this.iosUrl, query, template, 'connect-ios')

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link
      },
      subject: gettext('Firefox Account Verified'),
      template: template,
      templateValues: {
        alternativeLink: alternativeLink,
        androidUrl: androidLink,
        androidLinkAttributes: linkAttributes(androidLink),
        link: link,
        iosUrl: iosLink,
        iosLinkAttributes: linkAttributes(iosLink),
        privacyUrl: this.createPrivacyLink(template),
        supportUrl: this.createSupportLink(template),
        supportLinkAttributes: this._supportLinkAttributes(template)
      },
      uid: message.uid
    })
  }

  Mailer.prototype.suspiciousLocationEmail = function (message) {
    log.trace({ op: 'mailer.suspiciousLocationEmail', email: message.email, uid: message.uid })

    var template = 'suspiciousLocationEmail'
    var link = this.createPasswordResetLink(message.email, template)


    // the helper function `t` references `this.translator`. Because of
    // the way Handlebars `each` loops work, a translator instance must be
    // added to each entry or else no translator is available when translating
    // the entry.
    var translator = this.translator(message.acceptLanguage)

    message.locations.forEach(function (entry) {
      entry.translator = translator
    })

    return this.send({
      acceptLanguage: message.acceptLanguage,
      email: message.email,
      headers: {
        'X-Link': link
      },
      subject: gettext('Suspicious activity with your Firefox Account'),
      template: template,
      templateValues: {
        privacyUrl: this.createPrivacyLink(template),
        locations: message.locations,
        resetLink: link
      }
    })
  }

  Mailer.prototype.verificationReminderEmail = function (message) {
    log.trace({ op: 'mailer.verificationReminderEmail', email: message.email, type: message.type })

    if (! message || ! message.code || ! message.email) {
      log.error({
        op: 'mailer.verificationReminderEmail',
        err: 'Missing code or email'
      })
      return
    }

    var subject = gettext('Hello again.')
    var template = 'verificationReminderFirstEmail'
    if (message.type === 'second') {
      subject = gettext('Still there?')
      template = 'verificationReminderSecondEmail'
    }

    var query = {
      uid: message.uid,
      code: message.code,
      reminder: message.type
    }

    var link = this._generateUTMLink(this.verificationUrl, query, template, 'activate')
    var alternativeLink = this._generateUTMLink(this.verificationUrl, query, template, 'activate-alternative')

    query.one_click = true
    var oneClickLink = this._generateUTMLink(this.verificationUrl, query, template, 'activate-oneclick')

    return this.send({
      acceptLanguage: message.acceptLanguage || 'en',
      email: message.email,
      headers: {
        'X-Link': link,
        'X-Uid': message.uid,
        'X-Verify-Code': message.code
      },
      subject: subject,
      template: template,
      templateValues: {
        alternativeLink: alternativeLink,
        email: message.email,
        link: link,
        oneClickLink: oneClickLink,
        privacyUrl: this.createPrivacyLink(template),
        supportUrl: this.createSupportLink(template),
        supportLinkAttributes: this._supportLinkAttributes(template)
      },
      uid: message.uid
    })
  }

  Mailer.prototype._generateUTMLink = function (link, query, template, context) {
    if (!query) {
      query = {}
    }

    query['utm_source'] = 'email'
    query['utm_medium'] = 'email'

    var campaign = templateNameToCampaignMap[template]
    if (campaign && !query['utm_campaign']) {
      query['utm_campaign'] = utmPrefix + campaign
    }

    if (context) {
      query['utm_context'] = utmPrefix + context
    }

    return link + '?' + qs.stringify(query)
  }

  Mailer.prototype.createPasswordResetLink = function (email, template) {
    var query = { email: email, reset_password_confirm: false }

    return this._generateUTMLink(this.initiatePasswordResetUrl, query, template, 'reset-password')
  }

  Mailer.prototype.createPasswordChangeLink = function (email, template) {
    var query = { email: email }

    return this._generateUTMLink(this.initiatePasswordChangeUrl, query, template, 'change-password')
  }

  Mailer.prototype.createSignInLink = function (email, template, context) {
    var query = { email: email }

    return this._generateUTMLink(this.signInUrl, query, template, context)
  }

  Mailer.prototype.createSupportLink = function (template) {
    return this._generateUTMLink(this.supportUrl, {}, template, 'support')
  }

  Mailer.prototype.createPrivacyLink = function (template) {
    return this._generateUTMLink(this.privacyUrl, {}, template, 'privacy')
  }

  return Mailer
}
