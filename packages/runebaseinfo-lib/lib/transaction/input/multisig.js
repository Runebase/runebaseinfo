const assert = require('assert')
const Transaction = require('../transaction')
const Input = require('./input')
const Output = require('../output')
const Script = require('../../script')
const Signature = require('../../crypto/signature')
const Sighash = require('../sighash')
const PublicKey = require('../../publickey')
const TransactionSignature = require('../signature')

const OPCODES_SIZE = 1
const SIGNATURE_SIZE = 73

class MultiSigInput extends Input {
  constructor(input, pubkeys, threshold, signatures) {
    super(input)
    pubkeys = pubkeys || input.publicKeys
    threshold = threshold || this.threshold
    signatures = signatures || input.signatures
    function compare(x, y, fn) {
      let s1 = fn(x)
      let s2 = fn(y)
      if (s1 < s2) {
        return -1
      } else if (s1 > s2) {
        return 1
      } else {
        return 0
      }
    }
    this.publicKeys = pubkeys.slice().sort((x, y) => compare(x, y, k => k.toString('hex')))
    assert(
      Script.buildMultisigOut(this.publicKeys, threshold).equals(this.output.script),
      'Provided public keys don\'t match to the provided output script'
    )
    this.publicKeyIndex = {}
    for (let i = 0; i < this.publicKeys.length; ++i) {
      this.publicKeyIndex[this.publicKeys[i]] = i
    }
    this.threshold = threshold
    this.signatures = signatures ? this._deserializeSignatures(signatures) : new Array(this.publicKeys.length)
  }

  toObject() {
    let obj = super.toObject()
    obj.threshold = this.threshold
    obj.publicKeys = this.publickKeys.map(key => key.toString())
    obj.signatures = this._serializeSignatures()
    return obj
  }

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
    assert(!this.isFullySigned(), 'All needed signatures have already been added')
    assert(signature.publicKey.toString() in this.publicKeyIndex, 'Signature has no matching public key')
    assert(this.isValidSignature(transaction, signature))
    this.signatures[this.publickKeyIndex[signature.publicKey.toString()]] = signature
    this._updateScript()
    return this
  }

  _updateScript() {
    this.setScript(Script.buildMultisigIn(this.publicKeys, this.threshold, this._createSignatures()))
    return this
  }

  static normalizeSignatures(transaction, input, inputIndex, signatures, publicKeys) {
    return publicKeys.map(pubKey => {
      for (let signatureBuffer of signatures) {
        let signature = new TransactionSignature({
          signature: Signature.fromTxFormat(signatureBuffer),
          publicKey: pubKey,
          prevTxId: input.prevTxId,
          outputIndex: input.outputIndex,
          inputIndex,
          sigtype: Signature.SIGHASH_ALL
        })
        signature.signature.nhashtype = signature.sigtype
        if (Sighash.verify(
          transaction,
          signature.signature,
          signature.publicKey,
          signature.inputIndex,
          input.output.script
        )) {
          return signature
        }
      }
      return null
    })
  }

  _estimateSize() {
    return OPCODES_SIZE + this.threshold * SIGNATURE_SIZE
  }
}

module.exports = MultiSigInput
