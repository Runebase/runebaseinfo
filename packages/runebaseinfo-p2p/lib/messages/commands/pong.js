const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')
const {getNonce} = require('../utils')
const {BufferReader} = runebaseinfo.encoding

class PongMessage extends Message {
  constructor(arg, options) {
    super('pong', options)
    assert(
      arg === undefined || (Buffer.isBuffer(arg) && arg.length === 8),
      'First argument is expected to be an 8 byte buffer'
    )
    this.nonce = arg || getNonce()
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    this.nonce = parser.read(8)
    Message.checkFinished(parser)
  }

  getPayload() {
    return this.nonce
  }
}

module.exports = PongMessage
