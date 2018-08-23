const Message = require('../message')

class VerackMessage extends Message {
  constructor(arg, options) {
    super('verack', options)
  }
}

module.exports = VerackMessage
