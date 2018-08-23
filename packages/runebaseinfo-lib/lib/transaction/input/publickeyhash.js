const assert = require('assert')
const BufferUtil = require('../../util/buffer')
const {sha256ripemd160} = require('../../crypto/hash')
const Input = require('./input')
const Output = require('../output')
const Sighash = require('../sighash')
const Script = require('../../script')
const Signature = require('../../crypto/signature')
const TransactionSignature = require('../signature')

const SCRIPT_MAX_SIZE = 73 + 34

class PublicKeyHashInput extends Input {
  getSignatures(transaction, privateKey, index, sigtype, hashData) {
    assert(this.output instanceof Output)
    hashData = hashData || sha256ripemd160(privateKey.publicKey.toBuffer())
    sigtype = sigtype || Signature.SIGHASH_ALL
    if (Buffer.compare(hashData, this.output.script.getPublicKeyHash()) === 0) {
      return [new TransactionSignature({
        publicKey: privateKey.publicKey,
        prevTxId: this.prevTxId,
        outputIndex: this.outputIndex,
        inputIndex: index,
        signature: Sighash.sign(transaction, privateKey, sigtype, index, this.output.script),
        sigtype
      })]
    } else {
      return []
    }
  }

  addSignature(transaction, signature) {
    assert(this.isValidSignature(transaction, signature), 'Signature is invalid')
    this.setScript(Script.buildPublicKeyHashIn(
      signature.publicKey, signature.signature.toDER(), signature.sigtype
    ))
    return this
  }

  clearSignatures() {
    this.setScript(Script.empty())
    return this
  }

  isFullySigned() {
    return this.script.isPublicKeyHashIn()
  }

  _estimateSize() {
    return SCRIPT_MAX_SIZE
  }
}

module.exports = PublicKeyHashInput
