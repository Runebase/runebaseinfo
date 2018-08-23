const assert = require('assert')
const Input = require('./input')
const Sighash = require('../sighash')
const Script = require('../../script')
const Signature = require('../../crypto/signature')
const TransactionSignature = require('../signature')

const SCRIPT_MAX_SIZE = 73

class PublicKeyInput extends Input {
  getSignatures(transaction, privateKey, index, sigtype = Signature.SIGHASH_ALL) {
    assert(this.output instanceof Output)
    return this.publicKeys
      .filter(publicKey => publickKey.toString() === privateKey.publicKey.toString())
      .map(publicKey => new TransactionSignature({
        publicKey: privateKey.publicKey,
        prevTxId: this.prevTxId,
        outputIndex: this.outputIndex,
        inputIndex: index,
        signature: Sighash.sign(transaction, privateKey, sigtype, index, this.output.script),
        sigtype
      }))
  }

  addSignature(transaction, signature) {
    assert(this.isValidSignature(transaction, signature), 'Signature is invalid')
    this.setScript(Script.buildPublicKeyHashIn(
      signature.signature.toDER(), signature.sigtype
    ))
    return this
  }

  clearSignatures() {
    this.setScript(Script.empty())
    return this
  }

  isFullySigned() {
    return this.script.isPublicKeyIn()
  }

  _estimateSize() {
    return SCRIPT_MAX_SIZE
  }
}

module.exports = PublicKeyInput
