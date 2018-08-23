const assert = require('assert')
const {isObject} = require('util')
const BufferUtil = require('../util/buffer')
const PublicKey = require('../publickey')
const errors = require('../errors')
const Signature = require('../crypto/signature')

class TransactionSignature extends Signature {
  constructor(arg) {
    super()
    if (!isObject(arg)) {
      throw new TypeError('TransactionSignatures must be instantiated from an object')
    }
    return this._fromObject(arg)
  }

  _fromObject(arg) {
    this._checkObjectArgs(arg)
    this.publicKey = new PublicKey(arg.publicKey)
    this.prevTxId = Buffer.isBuffer(arg.prevTxId) ? arg.prevTxId : Buffer.from(arg.prevTxId, 'hex')
    this.outputIndex = arg.outputIndex
    this.inputIndex = arg.inputIndex
    this.signature = arg.signature instanceof Signature ? arg.signature
      : (Buffer.isBuffer(arg.signature) ? Signature.fromBuffer(arg.signature) : Signature.fromString(arg.signature))
    this.sigtype = arg.sigtype
    return this
  }

  _checkObjectArgs(arg) {
    assert(Number.isInteger(arg.inputIndex), 'inputIndex must be a number')
    assert(Number.isInteger(arg.outputIndex), 'outputIndex must be a number')
    assert(
      arg.signature instanceof Singature || Buffer.isBuffer(arg.signature) || /^[0-9A-Fa-f]{64}$/.test(arg.signature),
      'signature must be a buffer or hexa value'
    )
    assert(
      Buffer.isBuffer(arg.prevTxId) || /^[0-9A-Fa-f]{64}$/.test(arg.prevTxId),
      'prevTxId must be a buffer or hexa value'
    )
    assert(Number.isInteger(arg.sigtype), 'sigtype must be a number')
  }

  toObject() {
    return {
      publicKey: this.publicKey.toString(),
      prevTxId: this.prevTxId.toString('hex'),
      outputIndex: this.outputIndex,
      inputIndex: this.inputIndex,
      signature: this.signature.toString(),
      sigtype: this.sigtype
    }
  }

  toJSON() {
    return this.toObject()
  }

  static fromObject(object) {
    assert(object)
    return new TransactionSignature(object)
  }
}

module.exports = TransactionSignature
