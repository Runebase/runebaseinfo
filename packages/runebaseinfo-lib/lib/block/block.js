const assert = require('assert')
const {isObject} = require('util')
const BlockHeader = require('./blockheader')
const BN = require('../crypto/bn')
const {sha256sha256} = require('../crypto/hash')
const BufferReader = require('../encoding/bufferreader')
const BufferWriter = require('../encoding/bufferwriter')
const Transaction = require('../transaction')

const START_OF_BLOCK = 8
const NULL_HASH = Buffer.alloc(32)

class Block {
  constructor(arg) {
    Object.assign(this, Block._from(arg))
  }

  static _from(arg) {
    if (Buffer.isBuffer(arg)) {
      return Block._fromBufferReader(new BufferReader(arg))
    } else if (isObject(arg)) {
      return Block._fromObject(arg)
    } else {
      throw new TypeError('Unrecognized argument for Block')
    }
  }

  static _fromObject(data) {
    let transactions = data.transactions.map(
      tx => tx instanceof Transaction ? tx : Transaction.fromObject(tx)
    )
    return {
      header: BlockHeader.fromObject(data.header),
      transactions
    }
  }

  static fromObject(obj) {
    return new Block(Block._fromObject(obj))
  }

  static _fromBufferReader(br) {
    assert(!br.finished(), 'No block data received')
    let header = BlockHeader.fromBufferReader(br)
    let transactionCount = br.readVarintNum()
    let transactions = []
    for (let i = 0; i < transactionCount; ++i) {
      transactions.push(new Transaction().fromBufferReader(br))
    }
    return {header, transactions}
  }

  static fromBufferReader(br) {
    return new Block(Block._fromBufferReader(br))
  }

  static fromBuffer(buffer) {
    return Block.fromBufferReader(new BufferReader(buffer))
  }

  static fromString(string) {
    return Block.fromBuffer(Buffer.from(string, 'hex'))
  }

  static fromRawBlock(data) {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data, 'binary')
    }
    let br = new BufferReader(data)
    br.pos = START_OF_BLOCK
    return new Block(Block._fromBufferReader(br))
  }

  toObject() {
    return {
      header: this.header.toObject(),
      transactions: this.transactions.map(tx => tx.toObject())
    }
  }

  toJSON() {
    return this.toObject()
  }

  toBuffer() {
    return this.toBufferWriter().concat()
  }

  toHashBuffer() {
    return this.toHashBufferWriter().concat()
  }

  toString() {
    return this.toBuffer().toString('hex')
  }

  get prevBlock() {
    return this.header.prevHash.toString('hex')
  }

  toBufferWriter(bw = new BufferWriter()) {
    bw.write(this.header.toBuffer())
    bw.writeVarintNum(this.transactions.length)
    for (let transaction of this.transactions) {
      transaction.toBufferWriter(bw)
    }
    return bw
  }

  toHashBufferWriter(bw = new BufferWriter()) {
    bw.write(this.header.toBuffer())
    bw.writeVarintNum(this.transactions.length)
    for (let transaction of this.transactions) {
      transaction.toHashBufferWriter(bw)
    }
    return bw
  }

  getTransactionHashes() {
    if (this.transactions.length === 0) {
      return [NULL_HASH]
    } else {
      return this.transactions.map(tx => tx._getHash())
    }
  }

  getMerkleTree() {
    let tree = this.getTransactionHashes()
    let offset = 0
    for (let size = this.transactions.length; size > 1; size = (size + 1) >>> 1) {
      for (let i = 0; i < size; ++i) {
        let i2 = Math.min(i + 1, size - 1)
        let buffer = Buffer.concat([tree[offset + i], tree[offset + i2]])
        tree.push(sha256sha256(buffer))
      }
      offset += size
    }
    return tree
  }

  getMerkleRoot() {
    let tree = this.getMerkleTree()
    return tree[tree.length - 1]
  }

  validMerkleRoot() {
    let h = new BN(this.header.merkleRoot.toString('hex'), 'hex')
    let c = new BN(this.getMerkleRoot().toString('hex'), 'hex')
    return h.cmp(c) === 0
  }

  _getHash() {
    return this.header._getHash()
  }

  get id() {
    this._id = this._id || this.header.id
    return this._id
  }

  get hash() {
    return this.id
  }

  inspect() {
    return `<Block ${this.id}>`
  }
}

exports = module.exports = Block
exports.MAX_BLOCK_SIZE = 1000000
exports.PROOF_OF_STAKE = 'proof-of-stake'
exports.PROOF_OF_WORK = 'proof-of-work'
