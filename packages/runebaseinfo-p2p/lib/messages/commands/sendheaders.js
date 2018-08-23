const Message = require('../message')

class SendheadersMessage extends Message {
  constructor(arg, options) {
    super('sendheaders', options)
  }
}

module.exports = SendheadersMessage
