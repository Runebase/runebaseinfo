const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')
const {checkFinished} = require('../utils')
const {BufferReader, BufferWriter} = runebaseinfo.encoding

class SendCmpctMessage extends Message {
  constructor(arg, options) {
    super('sendcmpct', options)
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    this.useCmpctBlock = !!parser.readUInt8()
    this.cmpctBlockVersion = parser.readUInt64LEBN()
    Message.checkFinished(parser)
  }

  getPayload() {
    let bw = new BufferWriter()
    bw.writeUInt8(this.useCmpctBlock)
    bw.writeUInt64LEBN(this.cmpctBlockVersion)
    return bw.concat()
  }
}

module.exports = SendCmpctMessage
