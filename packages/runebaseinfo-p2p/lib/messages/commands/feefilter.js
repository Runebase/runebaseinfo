const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')
const {checkFinished} = require('../utils')
const {BufferReader, BufferWriter} = runebaseinfo.encoding

class FeeFilterMessage extends Message {
  constructor(arg, options) {
    super('feefilter', options)
    this.feerate = arg
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    this.feerate = parser.readUInt64LEBN()
    Message.checkFinished(parser)
  }

  getPayload() {
    let bw = new BufferWriter()
    bw.writeUInt64LEBN(this.feerate)
    return bw.concat()
  }
}

module.exports = FeeFilterMessage
