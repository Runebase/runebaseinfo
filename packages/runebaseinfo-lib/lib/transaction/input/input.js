const assert = require('assert')
const {isString, isObject} = require('util')
const errors = require('../../errors')
const BufferWriter = require('../../encoding/bufferwriter')
const Script = require('../../script')
const Sighash = require('../sighash')
const Output = require('../output')
const TransactionSignature = require('../signature')
const BufferUtil = require('../../util/buffer')

const MAXINT = 0xffffffff
const DEFAULT_RBF_SEQNUMBER = MAXINT - 2
const DEFAULT_SEQNUMBER = MAXINT
const DEFAULT_LOCKTIME_SEQNUMBER = MAXINT - 1

class Input {
  constructor(params) {
    if (params) {
      this._fromObject(params)
    }
  }

  get script() {
    if (!this._script) {
      this._script = new Script(this._scriptBuffer)
      this._script._isInput = true
    }
    return this._script
  }

  static fromObject(obj) {
    assert(isObject(obj))
    return new Input()._fromObject(obj)
  }

  _fromObject(params) {
    let prevTxId
    if (/^[0-9A-Za-z]{64}$/.test(params.prevTxId)) {
      prevTxId = Buffer.from(params.prevTxId, 'hex')
    } else {
      prevTxId = params.prevTxId
    }
    this.output = params.output && (
      params.output instanceof Output ? params.output : new Output(params.output)
    )
    this.prevTxId = prevTxId || params.txidbuf
    this.outputIndex = 'outputIndex' in params ? params.outputIndex : params.txoutnum
    this.sequenceNumber = 'sequenceNumber' in params ? params.sequenceNumber : (
      'seqnum' in params ? params.seqnum : DEFAULT_SEQNUMBER
    )
    if (!('script' in params) && !('scriptBuffer' in params)) {
      throw new errors.Transaction.Input.MissingScript()
    }
    this.setScript(params.scriptBuffer || params.script)
    return this
  }

  toObject() {
    let obj = {
      prevTxId: this.prevTxId.toString('hex'),
      outputIndex: this.outputIndex,
      sequenceNumber: this.sequenceNumber,
      script: this._scriptBuffer.toString('hex')
    }
    if (this.script) {
      obj.scriptString = this.script.toString()
    }
    if (this.output) {
      obj.output = this.output.toObject()
    }
    return obj
  }

  toJSON() {
    return this.toObject()
  }

  _deserializeSignatures(signatures) {
    return signatures.map(signature => signature && new TransactionSignature(signature))
  }

  _serializeSignatures() {
    return this.signatures.map(signature => signature && signature.toObject())
  }

  _createSignatures() {
    return this.signatures
      .filter(x => x !== undefined)
      .map(signature => Buffer.concat([
        signature.signature.toDER(),
        BufferUtil.integerAsSingleByteBuffer(signature.sigtype)
      ]))
  }

  static fromBufferReader(br) {
    let input = new Input()
    input.prevTxId = br.readReverse(32)
    input.outputIndex = br.readUInt32LE()
    input._scriptBuffer = br.readVarLengthBuffer()
    input.sequenceNumber = br.readUInt32LE()
    return input
  }

  toBufferWriter(writer = new BufferWriter()) {
    writer.writeReverse(this.prevTxId)
    writer.writeUInt32LE(this.outputIndex)
    let script = this._scriptBuffer
    writer.writeVarintNum(script.length)
    writer.write(script)
    writer.writeUInt32LE(this.sequenceNumber)
    return writer
  }

  setScript(script) {
    this._script = null
    if (script instanceof Script) {
      this._script = script
      this._script._isInput = true
      this._scriptBuffer = script.toBuffer()
    } else if (/^[0-9A-Fa-f]+$/.test(script)) {
      this._scriptBuffer = Buffer.from(script, 'hex')
    } else if (isString(script)) {
      this._script = new Script(script)
      this._script._isInput = true
      this._scriptBuffer = this._script.toBuffer()
    } else if (Buffer.isBuffer(script)) {
      this._scriptBuffer = script
    } else {
      throw new TypeError('Invalid argument type: script')
    }
    return this
  }

  getSignatures() {
    throw new errors.AbstractMethodInvoked(
      'Trying to sign unsupported output type (only P2PKH and P2SH multisig inputs are supported)' +
      ' for input: ' + JSON.stringify(this)
    )
  }

  addSignature() {
    throw new errors.AbstractMethodInvoked('Input#addSignature')
  }

  clearSignatures() {
    this.signatures = new Array(this.publicKeys.length)
    this._updateScript()
  }

  isFullySigned() {
    return this.countSignatures() === this.threshold
  }

  countMissingSignatures() {
    this.threshold - this.countSignatures()
  }

  countSignatures() {
    return this.signatures.reduce((sum, signature) => sum + !!signature, 0)
  }

  publicKeysWithoutSignature() {
    return this.publicKeys.filter(
      publicKey => !(this.publicKeyIndex[publicKey.toString()] in this.signatures)
    )
  }

  isFullySigned() {
    throw new errors.AbstractMethodInvoked('Input#isFullySigned')
  }

  isFinal() {
    return this.sequenceNumber !== 0xffffffff
  }

  isValidSignature(transaction, signature) {
    signature.signature.nhashtype = signature.sigtype
    return Sighash.verify(
      transaction,
      signature.signature,
      signature.publicKey,
      signature.inputIndex,
      this.output.script
    )
  }

  isNull() {
    return this.prevTxId.toString('hex') === '0'.repeat(64) && this.outputIndex === 0xffffffff
  }

  _estimateSize() {
    return this.toBufferWriter().toBuffer().length
  }
}

exports = module.exports = Input
exports.MAXINT = MAXINT
exports.DEFAULT_RBF_SEQNUMBER = DEFAULT_RBF_SEQNUMBER
exports.DEFAULT_SEQNUMBER = DEFAULT_SEQNUMBER
exports.DEFAULT_LOCKTIME_SEQNUMBER = DEFAULT_LOCKTIME_SEQNUMBER
