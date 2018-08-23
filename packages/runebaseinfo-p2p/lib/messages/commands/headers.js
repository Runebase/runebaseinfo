const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')
const {BufferReader, BufferWriter} = runebaseinfo.encoding

class HeadersMessage extends Message {
  constructor(arg, options) {
    super('headers', options)
    this.BlockHeader = options.BlockHeader
    assert(
      arg === undefined || Array.isArray(arg),
      'First argument is expected to be an array of BlockHeader instances'
    )
    this.headers = arg
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    let count = parser.readVarintNum()
    this.headers = []
    for (let i = 0; i < count; ++i) {
      let header = this.BlockHeader.fromBufferReader(parser)
      this.headers.push(header)
      let txn_count = parser.readUInt8()
      assert(txn_count === 0, 'txn_count should always be 0')
    }
    Message.checkFinished(parser)
  }

  getPayload() {
    let bw = new BufferWriter()
    bw.writeVarintNum(this.headers.length)
    for (let header of this.headers) {
      bw.write(header.toBuffer())
      bw.writeUInt8(0)
    }
    return bw.concat()
  }
}

module.exports = HeadersMessage
