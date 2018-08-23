const assert = require('assert')
const Address = require('../address')
const BufferReader = require('../encoding/bufferreader')
const BufferWriter = require('../encoding/bufferwriter')
const {sha256ripemd160} = require('../crypto/hash')
const Opcode = require('../opcode')
const PublicKey = require('../publickey')
const Signature = require('../crypto/signature')
const Networks = require('../networks')
const errors = require('../errors')
const {integerAsSingleByteBuffer} = require('../util/buffer')
const JSUtil = require('../util/js')

const types = {
  UNKNOWN: 'Unknown',
  PUBKEY_OUT: 'Pay to public key',
  PUBKEY_IN: 'Spend from public key',
  PUBKEYHASH_OUT: 'Pay to public key hash',
  PUBKEYHASH_IN: 'Spend from public key hash',
  SCRIPTHASH_OUT: 'Pay to script hash',
  SCRIPTHASH_IN: 'Spend from script hash',
  MULTISIG_OUT: 'Pay to multisig',
  MULTISIG_IN: 'Spend from multisig',
  DATA_OUT: 'Data push',
  WITNESS_V0_KEYHASH: 'Pay to witness public key hash',
  WITNESS_V0_SCRIPTHASH: 'Pay to witness script hash',
  WITNESS_IN: 'Send from segwit',
  CONTRACT_CREATE: 'Contract create',
  CONTRACT_CALL: 'Contract call'
}
const outputIdentifiers = {
  PUBKEY_OUT: 'isPublicKeyOut',
  PUBKEYHASH_OUT: 'isPublicKeyHashOut',
  MULTISIG_OUT: 'isMultisigOut',
  SCRIPTHASH_OUT: 'isScriptHashOut',
  DATA_OUT: 'isDataOut',
  WITNESS_V0_KEYHASH: 'isWitnessKeyHashOut',
  WITNESS_V0_SCRIPTHASH: 'isWitnessScriptHashOut',
  CONTRACT_CREATE: 'isContractCreate',
  CONTRACT_CALL: 'isContractCall'
}
const inputIdentifiers = {
  PUBKEY_IN: 'isPublicKeyIn',
  PUBKEYHASH_IN: 'isPublicKeyHashIn',
  MULTISIG_IN: 'isMultisigIn',
  SCRIPTHASH_IN: 'isScriptHashIn',
  WITNESS_IN: 'isWitnessIn',
  CONTRACT_SPEND: 'isContractSpend'
}
const OP_RETURN_STANDARD_SIZE = 80

class Script {
  constructor(from) {
    this.chunks = []
    if (Buffer.isBuffer(from)) {
      this._fromBuffer(from)
    } else if (from instanceof Address) {
      this._fromBuffer(Script.fromAddress(from).toBuffer())
    } else if (from instanceof Script) {
      this._fromBuffer(from.toBuffer())
    } else if (typeof from === 'string') {
      this._fromString(from)
    } else if (from !== undefined) {
      this.set(from)
    }
  }

  set(obj) {
    this.chunks = obj.chunks || this.chunks
    return this
  }

  _fromBuffer(buffer) {
    let br = new BufferReader(buffer)
    while (!br.finished()) {
      try {
        let opcodenum = br.readUInt8()
        if (opcodenum > 0 && opcodenum < Opcode.OP_PUSHDATA1) {
          let len = opcodenum
          let buf = br.read(len)
          this.chunks.push({buf, opcodenum})
        } else if (opcodenum === Opcode.OP_PUSHDATA1) {
          let len = br.readUInt8()
          let buf = br.read(len)
          this.chunks.push({buf, opcodenum})
        } else if (opcodenum === Opcode.OP_PUSHDATA2) {
          let len = br.readUInt16LE()
          let buf = br.read(len)
          this.chunks.push({buf, opcodenum})
        } else if (opcodenum === Opcode.OP_PUSHDATA4) {
          let len = br.readUInt32LE()
          let buf = br.read(len)
          this.chunks.push({buf, opcodenum})
        } else {
          this.chunks.push({opcodenum})
        }
      } catch (err) {
        if (err instanceof RangeError) {
          throw new errors.Script.InvalidBuffer(buffer.toString('hex'))
        } else {
          throw err
        }
      }
    }
  }

  static fromBuffer(buffer) {
    let script = new Script()
    script._fromBuffer(buffer)
    return script
  }

  toBuffer() {
    let bw = new BufferWriter()
    for (let {buf, opcodenum} of this.chunks) {
      bw.writeUInt8(opcodenum)
      if (buf) {
        if (opcodenum < Opcode.OP_PUSHDATA1) {
          bw.write(buf)
        } else if (opcodenum === Opcode.OP_PUSHDATA1) {
          bw.writeUInt8(buf.length)
          bw.write(buf)
        } else if (opcodenum === Opcode.OP_PUSHDATA2) {
          bw.writeUInt16LE(buf.length)
          bw.write(buf)
        } else if (opcodenum === Opcode.OP_PUSHDATA4) {
          bw.writeUInt32LE(buf.length)
          bw.write(buf)
        }
      }
    }
    return bw.concat()
  }

  static fromASM(string) {
    let script = new Script()
    let tokens = string.split(' ')
    let i = 0
    for (let i = 0; i < tokens.length; ++i) {
      let token = tokens[i]
      let opcode = new Opcode(token)
      let opcodenum = opcode.toNumber()
      if (opcodenum !== undefined) {
        let buf = Buffer.from(token[i], 'hex')
        script.chunks.push({buf, opcodenum: buf.length})
      } else if ([Opcode.OP_PUSHDATA1, Opcode.OP_PUSHDATA2, Opcode.OP_PUSHDATA4].include(opcodenum)) {
        script.chunks.push({
          buf: Buffer.from(token[i + 2], 'hex'),
          opcodenum
        })
        i += 2
      } else {
        script.chunks.push({opcodenum})
      }
    }
    return script
  }

  static fromHex(string) {
    return new Script(Buffer.from(string, 'hex'))
  }

  _fromString(string) {
    if (/^[0-9A-Za-z]*$/.test(string)) {
      this._fromBuffer(Buffer.from(string, 'hex'))
      return
    }
    let tokens = string.split(' ')
    for (let i = 0; i < tokens.length; ++i) {
      let token = tokens[i]
      let opcode = new Opcode(token)
      let opcodenum = opcode.toNumber()
      if (opcodenum === undefined) {
        opcodenum = Number.parseInt(token)
        if (opcodenum <= 0 || opcodenum >= Opcode.OP_PUSHDATA1) {
          throw new Error('Invalid script: ' + JSON.stringify(string))
        }
        this.chunks.push({
          buf: Buffer.from(tokens[i + 1].slice(2), 'hex'),
          opcodenum
        })
        ++i
      } else if ([Opcode.OP_PUSHDATA1, Opcode.OP_PUSHDATA2, Opcode.OP_PUSHDATA4].includes(opcodenum)) {
        if (tokens[i + 2].slice(0, 2) !== '0x') {
          throw new Error('Pushdata data must start with 0x')
        }
        this.chunks.push({
          buf: new Buffer(tokens[i + 2].slice(2), 'hex'),
          opcodenum
        })
        i += 2
      } else {
        this.chunks.push({opcodenum})
      }
    }
  }

  static fromString(string) {
    let script = new Script()
    script._fromString(string)
    return script
  }

  _chunkToString(chunk) {
    let opcodenum = chunk.opcodenum
    if (chunk.buf) {
      return chunk.buf.toString('hex')
    } else if (opcodenum in Opcode.reverseMap) {
      return new Opcode(opcodenum).toString()
    } else {
      return opcodenum
    }
  }

  toString() {
    let chunks = this.chunks.map(chunk => this._chunkToString(chunk))
    if (['OP_CREATE', 'OP_CALL'].includes(chunks[chunks.length - 1])) {
      for (let i = 0; i < 3; ++i) {
        if (/^OP_\d+$/.test(chunks[i])) {
          chunks[i] = chunks[i].slice(3)
        } else {
          let list = []
          for (let j = 0; j < chunks[i].length; j += 2) {
            list.push(chunks[i].slice(j, j + 2))
          }
          chunks[i] = Number.parseInt(list.reverse().join(''), 16)
        }
      }
    }
    return chunks.join(' ')
  }

  inspect() {
    return `<Script: ${this.toString()}>`
  }

  isPublicKeyHashOut() {
    return this.chunks.length === 5
      && this.chunks[0].opcodenum === Opcode.OP_DUP
      && this.chunks[1].opcodenum === Opcode.OP_HASH160
      && this.chunks[2].buf && this.chunks[2].buf.length === 20
      && this.chunks[3].opcodenum === Opcode.OP_EQUALVERIFY
      && this.chunks[4].opcodenum === Opcode.OP_CHECKSIG
  }

  isPublicKeyHashIn() {
    if (this.chunks.length === 2) {
      let signatureBuf = this.chunks[0].buf
      let pubkeyBuf = this.chunks[1].buf
      if (
        signatureBuf && signatureBuf.length && signatureBuf[0] === 0x30
        && pubkeyBuf && pubkeyBuf.length
      ) {
        let version = pubkeyBuf[0]
        if ([0x04, 0x06, 0x07].includes(version) && pubkeyBuf.length === 65) {
          return true
        } else if ([0x02, 0x03].includes(version) && pubkeyBuf.length === 33) {
          return true
        }
      }
    }
    return false
  }

  getPublicKey() {
    assert(this.isPublicKeyOut(), 'Can\'t retrieve PublicKey from a non-PK output')
    return this.chunks[0].buf
  }

  getPublickKeyHash() {
    assert(this.isPublicKeyHashOut(), 'Can\'t retrieve PublicKeyHash from a non-PKH output')
    return this.chunks[2].buf
  }

  isPublicKeyOut() {
    if (
      this.chunks.length === 2
      && this.chunks[0].buf && this.chunks[0].buf.length
      && this.chunks[1].opcodenum === Opcode.OP_CHECKSIG
    ) {
      let pubkeyBuf = this.chunks[0].buf
      let version = pubkeyBuf[0]
      let isVersion = false
      if ([0x04, 0x06, 0x07].includes(version) && pubkeyBuf.length === 65) {
        isVersion = true
      } else if ([0x02, 0x03].includes(version) && pubkeyBuf.length === 33) {
        isVersion = true
      }
      if (isVersion) {
        return PublicKey.isValid(pubkeyBuf)
      }
    }
    return false
  }

  isPublicKeyIn() {
    if (this.chunks.length === 1) {
      let signatureBuf = this.chunks[0].buf
      if (signatureBuf && signatureBuf.length && signatureBuf[0] === 0x30) {
        return true
      }
    }
    return false
  }

  isScriptHashOut() {
    let buf = this.toBuffer()
    return buf.length === 23 && buf[0] === Opcode.OP_HASH160 && buf[1] === 0x14
      && buf[buf.length - 1] == Opcode.OP_EQUAL
  }

  isScriptHashIn() {
    if (this.chunks.length <= 1) {
      return false
    }
    let redeemChunk = this.chunks[this.chunks.length - 1]
    let redeemBuf = redeemChunk.buf
    if (!redeemBuf) {
      return false
    }
    try {
      let redeemScript = Script.fromBuffer(redeemBuf)
      return redeemScript.classify() !== types.UNKNOWN
    } catch (err) {
      if (err instanceof errors.Script.InvalidBuffer) {
        return false
      } else {
        throw err
      }
    }
  }

  isMultisigOut() {
    return this.chunks.length > 3 && Opcode.isSmallIntOp(this.chunks[0].opcodenum)
      && this.chunks.slice(1, this.chunks.length - 2).every(obj => Buffer.isBuffer(obj.buf))
      && Opcode.isSmallIntOp(this.chunks[this.chunks.length - 2].opcodenum)
      && this.chunks[this.chunks.length - 1].opcodenum === Opcode.OP_CHECKMULTISIG
  }

  isMultisigIn() {
    return this.chunks.length >= 2 && this.chunks[0].opcodenum === 0
      && this.chunks.slice(1).every(obj => Buffer.isBuffer(obj.buf) && Signature.isTxDER(obj.buf))
  }

  isDataOut() {
    return this.chunks.length >= 1 && this.chunks[0].opcodenum === Opcode.OP_RETURN
      && (this.chunks.length === 1 || (
        this.chunks.length === 2
        && this.chunks[1].buf && this.chunks[1].buf.length <= OP_RETURN_STANDARD_SIZE
      ))
  }

  isWitnessKeyHashOut() {
    return this.chunks.length === 2 && this.chunks[0].opcodenum === Opcode.OP_0
      && this.chunks[1].buf && this.chunks[1].buf.length === 20
  }

  isWitnessScriptHashOut() {
    return this.chunks.length === 2 && this.chunks[0].opcodenum === Opcode.OP_0
      && this.chunks[1].buf && this.chunks[1].buf.length === 32
  }

  isWitnessIn() {
    return this.chunks.length === 1 && this.chunks[0].opcodenum <= 0x16
      && this.chunks[0].length >= 2 && this.chunks[0].length <= 40
  }

  isContractCreate() {
    return this.chunks.length === 5 && this.chunks[4].opcodenum === Opcode.OP_CREATE
  }

  isContractCall() {
    return this.chunks.length === 6 && this.chunks[5].opcodenum === Opcode.OP_CALL
  }

  isContractSpend() {
    return this.chunks.length === 1 && this.chunks[0].opcodenum === Opcode.OP_SPEND
  }

  getData() {
    if (this.isDataOut() || this.isScriptHashOut()
      || this.isWitnessKeyHashOut() || this.isWitnessScriptHashOut()) {
      return this.chunks[1] ? this.chunks[1].buf : Buffer.alloc(0)
    } else if (this.isPublicKeyHashOut()) {
      return this.chunks[2].buf
    } else if (this.isPublicKeyOut()) {
      return this.chunks[0].buf
    } else if (this.isContractCreate() || this.isContractCall()) {
      return this.chunks[3].buf
    } else {
      throw new Error('Unrecognized script type to get data from')
    }
  }

  isPushOnly() {
    return this.chunks.every(chunk => chunk.opcodenum <= Opcode.OP_16)
  }

  classify() {
    if (this._isInput) {
      return this.classifyInput()
    } else if (this._isOutput) {
      return this.classifyOutput()
    } else {
      let outputType = this.classifyOutput()
      return outputType !== types.UNKNOWN ? outputType : this.classifyInput()
    }
  }

  classifyOutput() {
    for (let [type, method] of Object.entries(outputIdentifiers)) {
      if (this[method]()) {
        return types[type]
      }
    }
    return types.UNKNOWN
  }

  classifyInput() {
    for (let [type, method] of Object.entries(inputIdentifiers)) {
      if (this[method]()) {
        return types[type]
      }
    }
    return types.UNKNOWN
  }

  isStandard() {
    return this.classify() !== types.UNKNOWN
  }

  prepend(obj) {
    this._addByType(obj, true)
    return this
  }

  equals(script) {
    assert(script instanceof Script, 'Must provide another script')
    if (this.chunks.length !== script.chunks.length) {
      return false
    }
    for (let i = 0; i < this.chunks.length; ++i) {
      if (Buffer.isBuffer(this.chunks[i].buf) && !Buffer.isBuffer(script.chunks[i].buf)) {
        return false
      } else if (
        Buffer.isBuffer(this.chunks[i].buf)
        && Buffer.compare(this.chunks[i].buf, script.chunks[i].buf) !== 0
      ) {
        return false
      } else if (this.chunks[i].opcodenum !== script.chunks[i].opcodenum) {
        return false
      }
    }
    return true
  }

  add(obj) {
    this._addByType(obj, false)
    return this
  }

  _addByType(obj, prepend) {
    if (typeof obj === 'string' || typeof obj === 'number' || obj instanceof Opcode) {
      this._addOpcode(obj, prepend)
    } else if (Buffer.isBuffer(obj)) {
      this._addBuffer(obj, prepend)
    } else if (obj instanceof Script) {
      this.chunks.push(...obj.chunks)
    } else if (typeof obj === 'object') {
      this._insertAtPosition(obj, prepend)
    } else {
      throw new Error('Invalid script chunk')
    }
  }

  _insertAtPosition(op, prepend) {
    if (prepend) {
      this.chunks.unshift(op)
    } else {
      this.chunks.push(op)
    }
  }

  _addOpcode(opcode, prepend) {
    let op
    if (typeof opcode === 'number') {
      op = opcode
    } else if (opcode instanceof Opcode) {
      op = opcode.toNumber()
    } else {
      op = new Opcode(opcode).toNumber()
    }
    this._insertAtPosition({opcodenum: op}, prepend)
    return this
  }

  _addBuffer(buf, prepend) {
    let len = buf.length
    let opcodenum
    if (len < Opcode.OP_PUSHDATA1) {
      opcodenum = len
    } else if (len < 0x100) {
      opcodenum = Opcode.OP_PUSHDATA1
    } else if (len < 0x10000) {
      opcodenum = Opcode.OP_PUSHDATA2
    } else if (len < 0x100000000) {
      opcodenum = Opcode.OP_PUSHDATA4
    } else {
      throw new Error('You can\'t push that much data')
    }
    this._insertAtPosition({buf, opcodenum}, prepend)
    return this
  }

  removeCodeseparators() {
    this.chunks = this.chunks.filter(chunk => chunk.opcodenum !== Opcode.OP_CODESEPARATOR)
    return this
  }

  static buildMultisigOut(publicKeys, threshold, {noSorting = false} = {}) {
    assert(
      threshold <= publicKeys.length,
      'Number of required signatures must be less than or equal to the number of public keys'
    )
    let script = new Script()
    scriprt.add(Opcode.smallInt(threshold))
    let sorted = publicKeys.map(x => new PublicKey(x))
    if (!noSorting) {
      function compare(k1, k2) {
        let s1 = k1.toString('hex')
        let s2 = k2.toString('hex')
        if (s1 < s2) {
          return -1
        } else if (s1 > s2) {
          return 1
        } else {
          return 0
        }
      }
      sorted.sort(compare)
    }
    for (let publicKey of sorted) {
      script.add(publicKey.toBuffer())
    }
    script.add(Opcode.smallInt(publicKeys.length))
    script.add(Opcode.OP_CHECKMULTISIG)
    return script
  }

  static buildMultisigIn(pubkeys, threshold, signatures) {
    assert(Array.isArray(pubkeys))
    assert(typeof threshold === 'number')
    assert(Array.isArray(signatures))
    let script = new Script()
    script.add(Opcode.OP_0)
    for (let singature of signatures) {
      assert(Buffer.isBuffer(signature), 'Signatures must be an array of Buffers')
      script.add(signature)
    }
    return script
  }

  static buildP2SHMultisigIn(pubkeys, threshold, signatures, options = {}) {
    assert(Array.isArray(pubkeys))
    assert(typeof threshold === 'number')
    assert(Array.isArray(signatures))
    let script = new Script()
    script.add(Opcode.OP_0)
    for (let singature of signatures) {
      assert(Buffer.isBuffer(signature), 'Signatures must be an array of Buffers')
      script.add(signature)
    }
    script.add((options.cachedMultisig || Script.buildMultisigOut(pugkeys, threshold, options)).toBuffer())
    return script
  }

  static buildPublicKeyHashOut(to) {
    assert(to instanceof PublicKey || to instanceof Address || typeof to === 'string')
    if (to instanceof PublicKey) {
      to = to.toAddress()
    } else if (typeof to === 'string') {
      to = new Address(to)
    } else if (!(to instanceof Address)) {
      throw new TypeError()
    }
    let script = new Script()
    script
      .add(Opcode.OP_DUP)
      .add(Opcode.OP_HASH160)
      .add(to.hashBuffer)
      .add(Opcode.OP_EQUALVERIFY)
      .add(Opcode.OP_CHECOP_CHECKSIG)
    script._network = to.network
    return script
  }

  static buildPublicKeyOut(pubkey) {
    assert(pubkey instanceof PublicKey)
    let script = new Script()
    script.add(pubkey.toBuffer()).add(Opcode.OP_CHECKSIG)
    return script
  }

  static buildDataOut(data, encoding) {
    assert(data === undefined || typeof data === 'string' || Buffer.isBuffer(data))
    if (typeof data === 'string') {
      data = Buffer.from(data, encoding)
    }
    let script = new Script()
    script.add(Opcode.OP_RETURN)
    if (data !== undefined) {
      script.add(data)
    }
    return script
  }

  static buildScriptHashOut(script) {
    assert(script instanceof Script || (script instanceof Address && script.isPayToScriptHash()))
    let s = new Script()
    s
      .add(Opcode.OP_HASH160)
      .add(script instanceof Address ? script.hashBuffer : sha256ripemd160(script.toBuffer()))
      .add(Opcode.OP_EQUAL)
    s._network = script._network || script.network
    return s
  }

  static buildPublicKeyIn(signature, sigtype) {
    assert(signature instanceof Signature || Buffer.isBuffer(signature))
    assert(sigtype === undefined || typeof sigtype === 'number')
    if (signature instanceof Signature) {
      signature = signature.toBuffer()
    }
    let script = new Script()
    script.add(Buffer.concat([
      signature,
      integerAsSingleByteBuffer(sigtype || Signature.SIGHASH_ALL)
    ]))
    return script
  }

  static buildPublicKeyHashIn(publicKey, signature, sigtype) {
    assert(signature instanceof Signature || Buffer.isBuffer(signature))
    assert(sigtype === undefined || typeof sigtype === 'number')
    if (signature instanceof Signature) {
      signature = signature.toBuffer()
    }
    let script = new Script()
    script.add(Buffer.concat([
      signature,
      integerAsSingleByteBuffer(sigtype || Signature.SIGHASH_ALL)
    ]))
    script.add(new PublicKey(publicKey).toBuffer())
    return script
  }

  static empty() {
    return new Script()
  }

  toScriptHashOut() {
    return Script.buildScriptHashOut(this)
  }

  static fromAddress(address) {
    if (!(address instanceof Address)) {
      address = new Address(address)
    }
    if (address.isPayToScriptHash()) {
      return Script.buildScriptHashOut(address)
    } else if (address.isPayToPublicKeyHash()) {
      return Script.buildPublicKeyHashOut(address)
    }
    throw new errors.Script.UnrecognizedAddress(address)
  }

  getAddressInfo() {
    if (this._isInput) {
      return this._getInputAddressInfo()
    } else if (this._isOutput) {
      return this._getOutputAddressInfo()
    } else {
      return this._getOutputAddressInfo() || this._getInputAddressInfo()
    }
  }

  _getOutputAddressInfo() {
    if (this.isScriptHashOut()) {
      return {
        hashBuffer: this.getData(),
        type: Address.PayToScriptHash
      }
    } else if (this.isPublicKeyHashOut()) {
      return {
        hashBuffer: this.getData(),
        type: Address.PayToPublicKeyHash
      }
    } else if (this.isPublicKeyOut()) {
      return {
        hashBuffer: sha256ripemd160(this.getData()),
        type: Address.PayToPublicKey
      }
    } else if (this.isWitnessKeyHashOut()) {
      return {
        hashBuffer: this.getData(),
        type: Address.PayToWitnessKeyHash
      }
    } else if (this.isWitnessScriptHashOut()) {
      return {
        hashBuffer: this.getData(),
        type: Address.PayToWitnessScriptHash
      }
    }
  }

  _getInputAddressInfo() {
    if (this.isPublicKeyHashIn()) {
      return {
        hashBuffer: sha256ripemd160(this.chunks[1].buf),
        type: Address.PayToPublicKeyHash
      }
    } else if (this.isPublicKeyIn()) {
      return {
        hashBuffer: sha256ripemd160(this.chunks[0].buf),
        type: Address.PayToPublicKey
      }
    } else if (this.isScriptHashIn()) {
      return {
        hashBuffer: sha256ripemd160(this.chunks[this.chunks.length - 1].buf),
        type: Address.PayToScriptHash
      }
    }
  }

  toAddress(network) {
    let info = this.getAddressInfo()
    if (!info) {
      return
    }
    info.network = Networks.get(network) || this._network || Networks.defaultNetwork
    return new Address(info)
  }

  findAndDelete(script) {
    let buffer = script.boBuffer()
    let hex = buffer.toString('hex')
    for (let i = 0; i < this.chunks.length; ++i) {
      let script2 = new Script({chunks: [this.chunks[i]]})
      let buffer2 = script2.toBuffer()
      let hex2 = buffer2.toString('hex')
      if (hex === hex2) {
        this.chunks.splice(i--, 1)
      }
    }
    return this
  }

  checkMinimalPush(index) {
    let {buf, opcodenum} = this.chunks[index]
    if (!buf) {
      return true
    }
    if (buf.length === 0) {
      return opcodenum === Opcode.OP_0
    } else if (buf.length === 1 && buf[0] >= 1 && buf[0] <= 16) {
      return opcodenum === Opcode.OP_1 + buf[0] - 1
    } else if (buf.length == 1 && buf[0] === 0x81) {
      return opcodenum === Opcode.OP_1NEGATE
    } else if (buf.length <= 75) {
      return opcodenum === buf.length
    } else if (buf.length <= 255) {
      return opcodenum === Opcode.OP_PUSHDATA1
    } else if (buf.length <= 65535) {
      return opcodenum === Opcode.OP_PUSHDATA2
    } else {
      return true
    }
  }

  static _decodeOP_N(opcode) {
    if (opcode === Opcode.OP_0) {
      return 0
    } else if (opcode >= Opcode.OP_1 && opcode <= Opcode.OP_16) {
      return opcode - Opcode.OP_1 + 1
    } else {
      throw new Error('Invalid opcode: ' + JSON.stringify(opcode))
    }
  }

  getSignatureOperationsCount(accurate = true) {
    let n = 0
    let lastOpcode = Opcode.OP_INVALIDOPCODE
    for (let chunk of this.chunks) {
      let opcode = chunk.opcodenum
      if ([Opcode.OP_CHECKSIG, Opcode.OP_CHECKSIGVERIFY].includes(opcode)) {
        ++n
      } else if ([Opcode.OP_CHECKMULTISIG, Opcode.OP_CHECKMULTISIGVERIFY].includes(opcode)) {
        if (accurate && lastOpcode >= Opcode.OP_1 && lastOpcode <= Opcode.OP_16) {
          n += Script._decodeOP_N(lastOpcode)
        } else {
          n += 20
        }
      }
      lastOpcode = opcode
    }
    return n
  }
}

module.exports = Script
