const Message = require('../message')

class MempoolMessage extends Message {
  constructor(arg, options) {
    super('mempool', options)
  }
}

module.exports = MempoolMessage
