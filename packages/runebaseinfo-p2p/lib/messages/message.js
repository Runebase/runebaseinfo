const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')
const {BufferWriter} = runebaseinfo.encoding
const {sha256sha256} = runebaseinfo.crypto.Hash

class Message {
  constructor(command, options) {
    this.command = command
    this.network = options.network
  }

  setPayload(payload) {}

  getPayload() {
    return Buffer.alloc(0)
  }

  toBuffer() {
    assert(this.network, 'Need to have a defined network to serialize message')
    let commandBuffer = Buffer.alloc(12)
    commandBuffer.write(this.command, 'ascii')
    let payload = this.getPayload()
    let checksum = sha256sha256(payload).slice(0, 4)
    let bw = new BufferWriter()
    bw.write(this.network.networkMagic)
    bw.write(commandBuffer)
    bw.writeUInt32LE(payload.length)
    bw.write(checksum)
    bw.write(payload)
    return bw.concat()
  }

  serialize() {
    return this.toBuffer()
  }

  static checkFinished(parser) {
    if (!parser.finished()) {
      throw new Error('Data still available after parsing')
    }
  }
}

module.exports = Message
