const assert = require('assert')
const {isObject} = require('util')
const BlockHeader = require('./blockheader')
const {sha256sha256} = require('../crypto/hash')
const BufferReader = require('../encoding/bufferreader')
const BufferWriter = require('../encoding/bufferwriter')
const Transaction = require('../transaction')

class MerkleBlock {
  constructor(arg) {
    let info = {}
    if (Buffer.isBuffer(arg)) {
      info = MerkleBlock._fromBufferReader(new BufferReader(arg))
    } else if (isObject(arg)) {
      let header
      if (arg.header instanceof BlockHeader) {
        header = arg.header
      } else {
        header = BlockHeader.fromObject(arg.header)
      }
      info = {
        header,
        numTransactions: arg.numTransactions,
        hashes: arg.hashes,
        flags: arg.flags
      }
    } else {
      throw new TypeError('Unrecognized argument for MerkleBlock')
    }

    Object.assign(this, info)
    this._flagBitsUsed = 0
    this._hashesUsed = 0
  }

  static fromBuffer(buffer) {
    return MerkleBlock.fromBufferReader(new BufferReader(buffer))
  }

  static fromBufferReader(br) {
    return new MerkleBlock(MerkleBlock._fromBufferReader(br))
  }

  toBuffer() {
    return this.toBufferWriter().concat()
  }

  toBufferWriter(bw = new BufferWriter()) {
    bw.write(this.header.toBuffer())
    bw.writeUInt32LE(this.numTransactions)
    bw.writeVarintNum(this.hashes.length)
    for (let hash of this.hashes) {
      bw.write(Buffer.from(hash, 'hex'))
    }
    bw.writeVarintNum(this.flags.length)
    for (let flag of this.flags) {
      bw.writeUInt8(flag)
    }
    return bw
  }

  toObject() {
    return {
      header: this.header.toObject(),
      numTransactions: this.numTransactions,
      hashes: this.hashes,
      flags: this.flags
    }
  }

  toJSON() {
    return this.toObject()
  }

  validMerkleTree() {
    assert(Array.isArray(this.flags), 'MerkleBlock flags is not an array')
    assert(Array.isArray(this.hashes), 'MerkleBlock hashes is not an array')
    if (this.hashes.length > this.numTransactions) {
      return false
    } else if (this.flags.length << 3 < this.hashes.length) {
      return false
    }

    let height = this._calcTreeHeight()
    let options = {hashesUsed: 0, flagBitsUsed: 0}
    let root = this._traverseMerkleTree(height, 0, options)
    if (options.hashesUsed !== this.hashes.length) {
      return false
    } else {
      return Buffer.compare(root, this.header.merkleRoot) === 0
    }
  }

  _traverseMerkleTree(depth, pos, options = {}) {
    options.txs = options.txs || []
    options.flagBitsUsed = options.flagBitsUsed || 0
    options.hashesUsed = options.hashesUsed || 0

    if (options.flagBitsUsed > this.flags.length << 3) {
      return null
    }
    let isParentOfMatch = this.flags[options.flagBitsUsed >> 3] >>> (options.flagBitsUsed & 7) & 1
    ++options.flagBitsUsed
    if (depth === 0 || !isParentOfMatch) {
      if (options.hashesUsed >= this.hashes.length) {
        return null
      }
      let hash = this.hashes[options.hashesUsed++]
      if (depth === 0 && isParentOfMatch) {
        options.txs.push(hash)
      }
      return Buffer.from(hash, 'hex')
    } else {
      let left = this._traverseMerkleTree(depth - 1, pos << 1, options)
      let right
      if (pos * 2 + 1 < this._calcTreeWidth(depth - 1)) {
        right = _traverseMerkleTree(depth - 1, pos * 2 + 1, options)
      } else {
        right = left
      }
      return sha256sha256(Buffer.concat([left, right]))
    }
  }

  _calcTreeWidth(height) {
    return (this.numTransactions + (1 << height) - 1) >>> height
  }

  _calcTreeHeight() {
    let height = 0
    while (this._calcTreeWidth(height) > 1) {
      ++height
    }
    return height
  }

  hasTransaction(tx) {
    assert(
      tx instanceof Transaction || typeof tx === 'string',
      'Invalid tx given, tx must be a "string" or "Transaction"'
    )
    if (tx instanceof Transaction) {
      tx = Buffer.from(tx.id, 'hex').reverse().toString('hex')
    }
    let txs = []
    let height = this._calcTreeHeight()
    this._traverseMerkleTree(height, 0, {txs})
    return txs.includes(tx)
  }

  static _fromBufferReader(br) {
    assert(!br.finished(), 'No merkleblock data received')
    let info = {}
    info.header = BlockHeader.fromBufferReader(br)
    info.numTransactions = br.readUInt32LE()
    let numHashes = br.readVarintNum()
    info.hashes = []
    for (let i = 0; i < numHashes; ++i) {
      info.hashes.push(br.read(32).toString('hex'))
    }
    let numFlags = br.readVarintNum()
    info.flags = []
    for (let i =0 ; i < numFlags; ++i) {
      info.flags.push(br.readUInt8())
    }
    return info
  }

  static fromObject(obj) {
    return new MerkleBlock(obj)
  }
}

module.exports = MerkleBlock
