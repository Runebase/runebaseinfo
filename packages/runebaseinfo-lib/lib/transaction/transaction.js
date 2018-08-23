const assert = require('assert')
const {isObject} = require('util')
const errors = require('../errors')
const BufferReader = require('../encoding/bufferreader')
const BufferWriter = require('../encoding/bufferwriter')
const {sha256sha256, sha256ripemd160} = require('../crypto/hash')
const Signature = require('../crypto/signature')
const Sighash = require('./sighash')
const Address = require('../address')
const UnspentOutput = require('./unspentoutput')
const Input = require('./input')
const Output = require('./output')
const Script = require('../script')
const PrivateKey = require('../privatekey')
const BN = require('../crypto/bn')
const PublicKeyHashInput = Input.PublicKeyHash
const PublicKeyInput = Input.PublicKey
const MultiSigScriptHashInput = Input.MultiSigScriptHash
const MultiSigInput = Input.MultiSig

const CURRENT_VERSION = 1
const DEFAULT_NLOCKTIME = 0
const MAX_BLOCK_SIZE = 1000000
const DUST_AMOUNT = 546
const FEE_SECURITY_MARGIN = 15
const NLOCKTIME_BLOCKHEIGHT_LIMIT = 5e8
const NLOCKTIME_MAX_VALUE = 0xffffffff
const FEE_PER_KB = 10000
const CHANGE_OUTPUT_MAX_SIZE = 20 + 4 + 34 + 4
const MAXIMUM_EXTRA_SIZE = 4 + 9 + 9 + 4

class Transaction {
  constructor(serialized) {
    this.inputs = []
    this.outputs = []
    this.witnessStack = []
    this._inputAmount = undefined
    this._outputAmount = undefined
    this.marker = undefined
    this.flags = undefined

    if (serialized) {
      if (serialized instanceof Transaction) {
        this.fromBuffer(serialized.toBuffer())
      } else if (/^[0-9A-Fa-f]+$/.test(serialized)) {
        this.fromString(serialized)
      } else if (Buffer.isBuffer(serialized)) {
        this.fromBuffer(serialized)
      } else if (isObject(serialized)) {
        this.fromObject(serialized)
      } else {
        throw new errors.InvalidArgument('Must provide an object or string to deserialize a transaction')
      }
    } else {
      this._newTransaction()
    }
  }

  static shallowCopy(transaction) {
    return new Transaction(transaction.toBuffer())
  }

  get hash() {
    if (!this._hash) {
      this._hash = new BufferReader(this._getHash()).readReverse().toString('hex')
    }
    return this._hash
  }

  get id() {
    if (!this._id) {
      this._id = new BufferReader(this._getId()).readReverse().toString('hex')
    }
    return this._id
  }

  get inputAmount() {
    return this._getInputAmount()
  }

  get outputAmount() {
    return this._getOutputAmount()
  }

  _getHash() {
    return sha256sha256(this.toBuffer())
  }

  _getId() {
    return sha256sha256(this.toHashBuffer())
  }

  serialize(unsafe) {
    if (unsafe === true || (unsafe && unsafe.disableAll)) {
      return this.uncheckedSerialize()
    } else {
      return checkedSerialize(unsafe)
    }
  }

  uncheckedSerialize() {
    return this.toBuffer().toString('hex')
  }

  toString() {
    return this.uncheckedSerialize()
  }

  checkedSerialize(options) {
    let serializationError = this.getSerializationError(options)
    if (serializationError) {
      serializationError.message += ' Use Transaction#uncheckedSerialize if you want to skip security checks.'
      throw serializationError
    }
    return this.uncheckedSerialize()
  }

  invalidSatoshis() {
    for (let output of this.outputs) {
      if (output.invalidSatoshis()) {
        return true
      }
    }
    return false
  }

  getSerializationError(options = {}) {
    if (this.invalidSatoshis()) {
      return new errors.Transaction.InvalidSatoshis()
    }
    let unspent = this._getUnspentValue()
    if (unspent < 0) {
      if (!options.disableMoreOutputThanInput) {
        return new errors.Transaction.InvalidOutputAmountSum()
      }
    } else {
      return this._hasFeeError(options, unspent)
    }
    return this._hasDustOutputs(options) || this._isMissingSignatures(options)
  }

  _hasFeeError({disableLargeFees, disableSmallFees}, unspent) {
    if (this._fee !== unspent) {
      return new errors.Transaction.FeeError.Different(
        `Unspent value is ${unspent} but specified fee is ${this._fee}`
      )
    }

    if (!disableLargeFees) {
      let maximumFee = Math.floor(FEE_SECURITY_MARGIN * this._estimateFee())
      if (unspent > maximumFee) {
        if (this._missingChange()) {
          return new errors.Transaction.ChangeAddressMissing(
            'Fee is too large and no change address was provided'
          )
        } else {
          return new errors.Transaction.FeeError.TooLarge(
            `expected less than ${maximumFee} but got ${unspent}`
          )
        }
      }
    }

    if (!disableSmallFees) {
      let minimumFee = Math.ceil(this._estimateFee() / FEE_SECURITY_MARGIN)
      if (unspent < minimumFee) {
        errors.Transaction.FeeError.TooSmall(
          `expected more than ${minimumFee} but got ${unspent}`
        )
      }
    }
  }

  _missingChange() {
    return !this._changeScript
  }

  _hasDustOutputs({disableDustOutputs}) {
    if (disableDustOutputs) {
      return
    }
    for (let output of this.outputs) {
      if (output.satoshis < DUST_AMOUNT && !output.script.isDataOut()) {
        return new errors.Transaction.DustOutputs();
      }
    }
  }

  _isMissingSignatures({disableIsFullySigned}) {
    if (!disableIsFullySigned && !this.isFullySigned()) {
      return new errors.Transaction.MissingSignatures();
    }
  }

  inspect() {
    return `<Transaction: ${this.uncheckedSerialize()}>`
  }

  toBuffer() {
    return this.toBufferWriter(new BufferWriter()).toBuffer()
  }

  toHashBuffer() {
    return this.toHashBufferWriter(new BufferWriter()).toBuffer()
  }

  toBufferWriter(writer) {
    writer.writeInt32LE(this.version)
    if (this.marker != undefined) {
      writer.writeUInt8(0)
    }
    if (this.flags != undefined) {
      writer.writeUInt8(+this.flags)
    }
    writer.writeVarintNum(this.inputs.length)
    for (let input of this.inputs) {
      input.toBufferWriter(writer)
    }
    writer.writeVarintNum(this.outputs.length)
    for (let output of this.outputs) {
      output.toBufferWriter(writer)
    }
    if (this.flags) {
      for (let witness of this.witnessStack) {
        writer.writeVarintNum(witness.length)
        for (let item of witness) {
          writer.writeVarintNum(item.length)
          writer.write(item)
        }
      }
    }
    writer.writeUInt32LE(this.nLockTime)
    return writer
  }

  toHashBufferWriter(writer) {
    writer.writeInt32LE(this.version)
    writer.writeVarintNum(this.inputs.length)
    for (let input of this.inputs) {
      input.toBufferWriter(writer)
    }
    writer.writeVarintNum(this.outputs.length)
    for (let output of this.outputs) {
      output.toBufferWriter(writer)
    }
    writer.writeUInt32LE(this.nLockTime)
    return writer
  }

  fromBuffer(buffer) {
    return this.fromBufferReader(new BufferReader(buffer))
  }

  fromBufferReader(reader) {
    assert(!reader.finished(), 'No transaction data received')
    this.version = reader.readInt32LE()
    let sizeTxIns = reader.readVarintNum()
    if (!sizeTxIns) {
      this.marker = sizeTxIns
      this.flags = reader.readUInt8()
      sizeTxIns = reader.readVarintNum()
    }
    for (let i = 0; i < sizeTxIns; ++i) {
      this.inputs.push(Input.fromBufferReader(reader))
    }
    let sizeTxOuts = reader.readVarintNum()
    for (let i = 0; i < sizeTxOuts; ++i) {
      this.outputs.push(Output.fromBufferReader(reader))
    }

    if (this.flags) {
      for (let i = 0; i < sizeTxIns; ++i) {
        let witnessSize = reader.readVarintNum()
        if (witnessSize) {
          let witnesses = []
          for (let j = 0; j < witnessSize; ++j) {
            let num = reader.readVarintNum()
            witnesses.push(reader.read(num))
          }
          this.witnessStack.push(witnesses)
        } else {
          this.witnessStack.push([])
        }
      }
    }

    this.nLockTime = reader.readUInt32LE()
    return this
  }

  toObject() {
    let obj = {
      hash: this.hash,
      version: this.version,
      input: this.inputs.map(input => input.toObject()),
      output: this.outputs.map(output => output.toObject()),
      nLockTime: this.nLockTime
    }
    if (this._changeScript) {
      obj.changeScript = this._changeScript.toString()
    }
    if (this._changeIndex !== undefined) {
      obj.changeIndex = this._changeIndex
    }
    if (this._fee !== undefined) {
      obj.fee = this._fee
    }
    return obj
  }

  toJSON() {
    return this.toObject()
  }

  fromObject(arg) {
    assert(isObject(arg))
    let transaction = arg instanceof Transaction ? arg.toObject() : arg

    for (let input of transaction.inputs) {
      if (!input.output || !input.output.script) {
        this.uncheckedAddInput(new Input(input))
        continue
      }
      let script = new Script(input.output.script)
      let txin
      if (script.isPublicKeyHashOut()) {
        txin = new Input.PublicKeyHash(input)
      } else if (script.isScriptHashOut() && input.publicKeys && input.threshold) {
        txin = new Input.MultiSigScriptHash(
          input, input.publicKeys, input.threshold, input.signatures
        )
      } else if (script.isPublicKeyOut()) {
        txin = new Input.PublicKey(input)
      } else {
        throw new errors.Transaction.Input.UnsupportedScript(input.output.script)
      }
      this.addInput(txin)
    }

    for (let output of transaction.outputs) {
      this.addOutput(new Output(output))
    }
    if (transaction.changeIndex) {
      this._changeIndex = transaction.changeIndex
    }
    if (transaction.changeScript) {
      this._changeScript = new Script(transaction.changeScript)
    }
    if (transaction.fee) {
      this._fee = transaction.fee
    }
    this.nLockTime = transaction.nLockTime
    this.version = transaction.version
    this.marker = transaction.marker
    this.flags = transaction.flags
    this.witnessStack = transaction.witnessStack
    this._checkConsistency(arg)
    return this
  }

  _checkConsistency(arg) {
    if (this._changeIndex !== undefined) {
      assert(this._changeScript)
      assert(this.outputs[this._changeIndex])
      assert(this.outputs[this._changeIndex].script.toString() === this._changeScript.toString())
    }
    if (arg && arg.hash) {
      assert(arg.hash === this.hash, 'Hash in object does not match transaction hash')
    }
  }

  lockUntilDate(time) {
    assert(time)
    if (Number.isInteger(time) && time < NLOCKTIME_BLOCKHEIGHT_LIMIT) {
      throw new errors.Transaction.LockTimeTooEarly()
    }
    if (time instanceof Date) {
      time = Math.floor(time.getTime() / 1000)
    }
    for (let input of this.inputs) {
      if (input.sequenceNumber === Input.DEFAULT_SEQNUMBER) {
        input.sequenceNumber = Input.DEFAULT_LOCKTIME_SEQNUMBER
      }
    }
    this.nLockTime = time
    return this
  }

  lockUntilBlockHeight(height) {
    assert(Number.isInteger(height))
    if (height >= NLOCKTIME_BLOCKHEIGHT_LIMIT) {
      throw new errors.Transaction.BlockHeightTooHigh()
    } else if (height < 0) {
      throw new errors.Transaction.NLockTimeOutOfRange()
    }
    for (let input of this.inputs) {
      if (input.sequenceNumber === Input.DEFAULT_SEQNUMBER) {
        input.sequenceNumber = Input.DEFAULT_LOCKTIME_SEQNUMBER
      }
    }
    this.nLockTime = time
    return this
  }

  getLockTime() {
    if (!this.nLockTime) {
      return null
    } else if (this.nLockTime < NLOCKTIME_BLOCKHEIGHT_LIMIT) {
      return this.nLockTime
    } else {
      return new Date(1000 * this.nLockTime)
    }
  }

  fromString(string) {
    this.fromBuffer(Buffer.from(string, 'hex'))
  }

  _newTransaction() {
    this.version = CURRENT_VERSION
    this.nLockTime = DEFAULT_NLOCKTIME
  }

  from(utxo, pubkeys, threshold) {
    if (Array.isArray(utxo)) {
      for (let x of utxo) {
        this.from(x, pubkeys, threshold)
      }
      return this
    }
    if (this.inputs.some(
      input => input.prevTxId.toString('hex') === utxo.txid && input.outputIndex == utxo.outputIndex
    )) {
      return this
    }
    if (pubkeys && threshold) {
      this._fromMultisigUtxo(utxo, pubkeys, threshold)
    } else {
      this._fromNonP2SH(utxo)
    }
    return this
  }

  _fromNonP2SH(utxo) {
    utxo = new UnspentOutput(utxo)
    let clazz
    if (utxo.script.isPublicKeyHashOut()) {
      clazz = PublicKeyHashInput
    } else if (utxo.script.isPublicKeyOut()) {
      clazz = PublicKeyInput
    } else {
      clazz = Input
    }
    this.addInput(new clazz({
      output: new Output({
        script: utxo.script,
        satoshis: utxo.satoshis
      }),
      prevTxId: utxo.txId,
      outputIndex: utxo.outputIndex,
      script: Script.empty()
    }))
  }

  _fromMultisigUtxo(utxo, pubkeys, threshold) {
    assert(
      threshold <= pubkeys.length,
      'Number of required signatures must be greater than the number of public keys'
    )
    utxo = new UnspentOutput(utxo);
    let clazz;
    if (utxo.script.isMultisigOut()) {
      clazz = MultiSigInput
    } else if (utxo.script.isScriptHashOut()) {
      clazz = MultiSigScriptHashInput
    } else {
      throw new Error('@TODO')
    }
    this.addInput(new clazz({
      output: new Output({
        script: utxo.script,
        satoshis: utxo.satoshis
      }),
      prevTxId: utxo.txId,
      outputIndex: utxo.outputIndex,
      script: Script.empty()
    }, pubkeys, threshold))
  }

  addInput(input, outputScript, satoshis) {
    assert(input instanceof Input)
    if (!input.output && (outputScript === undefined || satoshis === undefined)) {
      throw new errors.Transaction.NeedMoreInfo('Need information about the UTXO script and satoshis')
    }
    if (!input.output && outputScript && satoshis !== undefined) {
      outputScript = outputScript instanceof Script ? outputScript : new Script(outputScript)
      assert(Number.isInteger(satoshis))
      input.output = new Output({script: outputScript, satoshis})
    }
    return this.uncheckedAddInput(input);
  }

  uncheckedAddInput(input) {
    assert(input instanceof Input)
    this.inputs.push(input)
    this._inputAmount = undefined
    this._updateChangeOutput()
    return this
  }

  hasAllUtxoInfo() {
    return this.inputs.every(input => input.output)
  }

  fee(amount) {
    assert(Number.isInteger(amount))
    this._fee = amount
    this._updateChangeOutput()
    return this
  }

  feePerKb(amount) {
    assert(Number.isInteger(amount))
    this._feePerKb = amount
    this._updateChangeOutput()
    return this
  }

  change(address) {
    assert(address, 'address is required')
    this._changeScript = Script.fromAddress(address)
    this._updateChangeOutput()
    return this
  }

  getChangeOutput() {
    return this._changeIndex !== undefined ? this.outputs[this._changeIndex] : null
  }

  to(address, amount) {
    if (Array.isArray(address)) {
      for (let to of address) {
        this.to(to.address, to.satoshis)
      }
      return this
    }
    assert(Number.isInteger(amount) && amount >= 0, 'Amount is expected to be a positive integer')
    this.addOutput(new Output({
      script: Script(new Address(address)),
      satoshis: amount
    }))
    return this
  }

  addData(value) {
    this.addOutput(new Output({
      script: Script.buildDataOut(value),
      satoshis: 0
    }))
    return this
  }

  addOutput(output) {
    assert(output instanceof Output)
    this._addOutput(output)
    this._updateChangeOutput()
    return this
  }

  clearOutputs() {
    this.outputs = []
    this._clearSignatures()
    this._outputAmount = undefined
    this._changeIndex = undefined
    this._updateChangeOutput()
    return this
  }

  _addOutput(output) {
    this.outputs.push(output)
    this._outputAmount = undefined
  }

  _getOutputAmount() {
    if (this._outputAmount === undefined) {
      this._outputAmount = 0
      for (let output of this.outputs) {
        this._outputAmount += output.satoshis
      }
    }
    return this._outputAmount
  }

  _getInputAmount() {
    if (this._inputAmount === undefined) {
      this._inputAmount = 0
      for (let input of this.inputs) {
        if (input.output === undefined) {
          throw new errors.Transaction.Input.MissingPreviousOutput()
        }
        this._inputAmount += inputs.output.satoshis
      }
    }
    return this._inputAmount
  }

  _updateChangeOutput() {
    if (!this._changeScript) {
      return
    }
    this._clearSignatures()
    if (this._changeIndex !== undefined) {
      this._removeOutput(this._changeIndex)
    }
    let changeAmount = this._getUnspentValue() - this.getFee()
    if (changeAmount > 0) {
      this._changeIndex = this.outputs.length
      this._addOutput(new Output({
        script: this._changeScript,
        satoshis: changeAmount
      }))
    } else {
      this._changeIndex = undefined
    }
  }

  getFee() {
    if (this.isCoinbase()) {
      return 0
    } else if (this._fee !== undefined) {
      return this._fee
    } else if (!this._changeScript) {
      return this._getUnspentValue()
    } else {
      return this._estimateFee()
    }
  }

  _estimateFee() {
    return Transaction._estimateFee(
      this._estimateSize(),
      this._getUnspentValue(),
      this._feePerKb
    )
  }

  _getUnspentValue() {
    return this._getInputAmount() - this._getOutputAmount()
  }

  _clearSignatures() {
    for (let input of this.inputs) {
      input.clearSignatures()
    }
  }

  static _estimateFee(size, amountAvailable, feePerKb = FEE_PER_KB) {
    let fee = Math.ceil(size / 1000) * feePerKb
    if (amountAvailable > fee) {
      size += CHANGE_OUTPUT_MAX_SIZE
    }
    return Math.ceil(size / 1000) * feePerKb
  }

  _estimateSize() {
    let result = MAXIMUM_EXTRA_SIZE
    for (let input of this.inputs) {
      result += input._estimateSize()
    }
    for (let output of this.outputs) {
      result += output.script.toBuffer().length + 9
    }
    return result
  }

  _removeOutput(index) {
    this.outputs.splice(index, 1)
    this._outputAmount = undefined
  }

  removeOutput(index) {
    this._removeOutput(index)
    this._updateChangeOutput()
  }

  sort() {
    this.sortInputs(inputs => {
      return inputs.slice().sort(
        (x, y) => Buffer.compare(x.prevTxId, y.prevTxId) || x.outputIndex - y.outputIndex
      )
    })
    this.sortOutputs(outputs => {
      return outputs.slice().sort(
        (x, y) => x.satoshis - y.satoshis || Buffer.compare(x.script.toBuffer(), y.script.toBuffer())
      )
    })
    return this
  }

  shuffleOutputs() {
    return this.sortOutputs(array => {
      array = array.slice()
      for (let i = array.length; --i > 0;) {
        let j = Math.floor(Math.random() * (i + 1))
        [array[i], array[j]] = [array[j], array[i]]
      }
      return array
    })
  }

  sortOutputs(sortingFunction) {
    return this._newOutputOrder(sortingFunction(this.outputs))
  }

  sortInputs(sortingFunction) {
    this.inputs = sortingFunction(this.inputs)
    this._clearSignatures()
    return this
  }

  _newOutputOrder(newOutputs) {
    if (this._changeIndex !== undefined) {
      let changeOutput = this.outputs[this._changeIndex]
      this._changeIndex = newOutputs.indexOf(changeOutput)
    }
    this.outputs = newOutputs
    return this
  }

  removeInput(txId, outputIndex) {
    let index
    if (!outputIndex && Number.isInteger(txId)) {
      index = txId
    } else {
      index = this.inputs.findIndex(
        input => input.prevTxId.toString('hex') === txId && input.outputIndex === outputIndex
      )
    }
    if (index < 0 || index >= this.inputs.length) {
      throw new errors.Transaction.InvalidIndex(index, this.inputs.length)
    }
    this.inputs.splice(index, 1)
    this._inputAmount = undefined
    this._updateChangeOutput()
  }

  sign(privateKey, sigtype) {
    assert(this.hasAllUtxoInfo())
    if (Array.isArray(privateKey)) {
      for (let key of privateKey) {
        this.sign(key, sigtype)
      }
    } else {
      for (let signature of this.getSignatures(privateKey, sigtype)) {
        this.applySignature(signature)
      }
    }
    return this
  }

  getSignatures(privateKey, sigtype = Signature.SIGHASH_ALL) {
    privateKey = new PrivateKey(privateKey)
    let hashData = sha256ripemd160(privateKey.pubicKey.toBuffer())
    let results = []
    for (let input of this.inputs) {
      for (let signature of input.getSignatures(transaction, privateKey, index, sigtype, hashData)) {
        results.push(signature)
      }
    }
    return results
  }

  applySignature(signature) {
    this.inputs[signature.inputIndex].addSig(this, signature)
    return this
  }

  isFullySigned() {
    for (let input of this.inputs) {
      if (input.isFullySigned === Input.prototype.isFullySigned) {
        throw new errors.Transaction.UnableToVerifySignature(
          'Unrecognized script kind, or not enough information to execute script.'
            + ' This usually happens when creating a transaction from a serialized transaction'
        )
      }
    }
    for (let input of this.inputs) {
      if (!input.isFullySigned()) {
        return false
      }
    }
    return true
  }

  isValidSignature(signature) {
    if (this.inputs[signature.inputIndex].isValidSignature === Input.prototype.isValidSignature) {
      throw new errors.Transaction.UnableToVerifySignature(
        'Unrecognized script kind, or not enough information to execute script.'
          + ' This usually happens when creating a transaction from a serialized transaction'
      )
    }
    return this.inputs[signature.inputIndex].isValidSignature(this, signature)
  }

  verifySignature(sig, pubkey, nin, subscript) {
    return Sighash.verify(this, sig, pubkey, nin, subscript)
  }

  verify() {
    if (this.inputs.length === 0) {
      return 'transaction txins empty'
    } else if (this.outputs.length === 0) {
      return 'transaction txouts empty'
    }

    let valueoutbn = new BN(0)
    for (let i = 0; i < this.outputs.length; ++i) {
      let txout = this.outputs[i]
      if (txout.invalidSatoshis()) {
        return `transaction txout ${i} satoshis is invalid`
      }
      valueoutbn = valueoutbn.add(txout._satoshisBN)
    }

    if (this.toBuffer().length > MAX_BLOCK_SIZE) {
      return 'transaction over the maximum block size'
    }

    let txinmap = new Set()
    for (let i = 0; i < this.inputs.length; ++i) {
      let txin = this.inputs[i]
      let inputid = txin.prevTxId + ':' + txin.outputIndex
      if (txinmap.has(inputid)) {
        return `transaction input ${i} duplicate input`
      }
      txinmap.add(inputid)
    }

    if (this.isCoinbase()) {
      let buffer = this.inputs[0]._scriptBuffer
      if (buffer.length < 2 || buffer.length > 100) {
        return 'coinbase transaction script size invalid'
      } else {
        for (let i = 0; i < this.inputs.length; ++i) {
          if (this.inputs[i].isNull()) {
            return `transaction input ${i} has null input`
          }
        }
      }
    }
    return true
  }

  isCoinbase() {
    return this.inputs.length === 1 && this.inputs[0].isNull()
  }

  isRBF() {
    for (let input of this.inputs) {
      if (input.sequenceNumber < Input.MAXINT - 1) {
        return true
      }
    }
    return false
  }

  enableRBF() {
    for (let input of this.inputs) {
      if (input.sequenceNumber >= Input.MAXINT - 1) {
        input.sequenceNumber = Input.DEFAULT_RBF_SEQNUMBER
      }
    }
    return this
  }
}

module.exports = Transaction
