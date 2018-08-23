const Message = require('../message')

class GetaddrMessage extends Message {
  constructor(arg, options) {
    super('getaddr', options)
  }
}

module.exports = GetaddrMessage
