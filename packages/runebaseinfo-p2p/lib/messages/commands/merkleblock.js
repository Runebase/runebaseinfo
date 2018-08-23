const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')

class MerkleblockMessage extends Message {
  constructor(arg, options) {
    super('merkleblock', options)
    this.MerkleBlock = options.MerkleBlock
    assert(
      arg === undefined || arg instanceof this.MerkleBlock,
      'An instance of MerkleBlock or undefined is expected'
    )
    this.merkleBlock = arg
  }

  setPayload(payload) {
    this.merkleBlock = this.MerkleBlock.fromBuffer(payload)
  }

  getPayload() {
    return this.merkleBlock ? this.merkleBlock.toBuffer() : Buffer.alloc(0)
  }
}

module.exports = MerkleblockMessage
