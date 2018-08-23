const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')
const {BufferReader, BufferWriter} = runebaseinfo.encoding

class AlertMessage extends Message {
  constructor(arg, options) {
    super('alert', options)
    args = args || {}
    this.payload = arg.payload || Buffer.alloc(32)
    this.signature = arg.signature || Buffer.alloc(32)
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    this.payload = parser.readVarLengthBuffer()
    this.signature = parser.readVarLengthBuffer()
    Message.checkFinished(parser)
  }

  getPayload() {
    let bw = new BufferWriter()
    bw.writeVarintNum(this.payload.length)
    bw.write(this.payload)
    bw.writeVarintNum(this.signature.length)
    bw.write(this.signature)
    return bw.concat()
  }
}

module.exports = AlertMessage
