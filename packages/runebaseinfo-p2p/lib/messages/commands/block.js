const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')

class BlockMessage extends Message {
  constructor(arg, options) {
    super('block', options)
    this.Block = options.Block
    assert(arg === undefined || arg instanceof this.Block, 'An instance of Block or undefined is expected')
    this.block = arg
  }

  setPayload(payload) {
    if ('fromRaw' in this.Block.prototype) {
      this.block = this.Block.fromRaw(payload)
    } else {
      this.block = this.Block.fromBuffer(payload)
    }
  }

  getPayload(payload) {
    if ('toRaw' in this.Block.prototype) {
      return this.block.toRaw()
    } else {
      return this.block.toBuffer()
    }
  }
}

module.exports = BlockMessage
