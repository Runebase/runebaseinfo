const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')
const {BufferReader, BufferWriter} = runebaseinfo.encoding

class RejectMessage extends Message {
  constructor(arg, options) {
    super('reject', options)
    arg = arg || {}
    this.message = arg.message
    this.ccode = arg.ccode
    this.reason = arg.reason
    this.data = arg.data
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    this.message = parser.readVarLengthBuffer().toString()
    this.ccode = parser.readUInt8()
    this.reason = parser.readVarLengthBuffer().toString()
    this.data = parser.readAll()
    Message.checkFinished(parser)
  }

  getPayload() {
    let bw = new BufferWriter()
    bw.writeVarintNum(this.message.length)
    bw.write(Buffer.from(this.message))
    bw.writeUInt8(this.ccode)
    bw.writeVarintNum(this.reason.length)
    bw.write(Buffer.from(this.reason))
    bw.write(this.data)
    return bw.concat()
  }
}

exports = module.exports = RejectMessage
exports.CCODE = {
  REJECT_MALFORMED: 0x01,
  REJECT_INVALID: 0x10,
  REJECT_OBSOLETE: 0x11,
  REJECT_DUPLICATE: 0x12,
  REJECT_NONSTANDARD: 0x40,
  REJECT_DUST: 0x41,
  REJECT_INSUFFICIENTFEE: 0x42,
  REJECT_CHECKPOINT: 0x43
}
