const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')
const {parseAddr, writeAddr} = require('../utils')
const {BufferReader, BufferWriter} = runebaseinfo.encoding

class AddrMessage extends Message {
  constructor(arg, options) {
    super('addr', options)
    assert(
      arg === undefined || Array.isArray(arg),
      'First argument is expected to be an array of addrs'
    )
    this.addresses = arg
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    let addrCount = parser.readVarintNum()
    this.addresses = []
    for (let i = 0; i < addrCount; ++i) {
      let time = new Date(parser.readUInt32LE() * 1000)
      let addr = parseAddr(parser)
      addr.time = time
      this.addresses.push(addr)
    }
    Message.checkFinished(parser)
  }

  getPayload() {
    let bw = new BufferWriter()
    bw.writeVarintNum(this.addresses.length)
    for (let addr of this.addresses) {
      bw.writeUInt32LE(addr.time.getTime() / 1000)
      writeAddr(addr, bw)
    }
    return bw.concat()
  }
}

module.exports = AddrMessage
