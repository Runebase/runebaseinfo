const assert = require('assert')
const {isObject, isString} = require('util')
const BN = require('../crypto/bn')
const BufferWriter = require('../encoding/bufferwriter')
const Script = require('../script')
const errors = require('../errors')

class Output {
  constructor(args) {
    if (!isObject(args)) {
      throw new TypeError('Unrecognized argument for Output')
    }
    this.satoshis = args.satoshis
    if (Buffer.isBuffer(args.script)) {
      this._scriptBuffer = args.script
    } else {
      let script
      if (/^[0-9A-Fa-f]+$/.test(args.script)) {
        script = Buffer.from(args.script, 'hex')
      } else {
        script = args.script
      }
      this.setScript(script)
    }
  }

  get script() {
    if (!this._script) {
      this.setScriptFromBuffer(this._scriptBuffer)
      this._script._isOutput = true
    }
    return this._script
  }

  get satoshis() {
    return this._satoshis
  }

  set satoshis(num) {
    if (num instanceof BN) {
      this._satoshis = num
    } else if (isString(num)) {
      this._satoshis = new BN(num)
    } else {
      assert(Number.isInteger(num) && num >= 0, 'Output satoshis is not a natural number')
      this._satoshis = BN.fromNumber(num)
    }
  }

  invalidSatoshis() {
    if (this._satoshis > Number.MAX_SAFE_INTEGER) {
      return 'transaction txout satoshis greater than max safe integer'
    } else if (this._satoshis !== this._satoshisBN.toNumber()) {
      return 'transaction txout satoshis has corrupted value'
    } else if (this._satoshis < 0) {
      return 'transaction txout negative'
    } else {
      return false;
    }
  }

  toObject() {
    return {
      satoshis: this.satoshis,
      script: this._scriptBuffer.toString('hex')
    }
  }

  toJSON() {
    return this.toObject()
  }

  static fromObject(data) {
    return new Output(data)
  }

  setScriptFromBuffer(buffer) {
    this._scriptBuffer = buffer
    try {
      this._script = Script.fromBuffer(this._scriptBuffer)
      this._script._isOutput = true
    } catch (err) {
      if (err instanceof errors.Script.InvalidBuffer) {
        this._script = null
      } else {
        throw err
      }
    }
  }

  setScript(script) {
    if (script instanceof Script) {
      this._scriptBuffer = script.toBuffer()
      this._script = script
      this._script._isOutput = true
    } else if (isString(script)) {
      this._script = script.fromString(script)
      this._scriptBuffer = this._script.toBuffer()
      this._script._isOutput = true
    } else if (Buffer.isBuffer(script)) {
      this.setScriptFromBuffer(script)
    } else {
      throw new TypeError('Invalid argument type: script')
    }
    return this
  }

  inspect() {
    let scriptStr
    if (this.script) {
      scriptStr = this.script.inspect()
    } else {
      scriptStr = this._scriptBuffer.toString('hex')
    }
    return `<Output (${this.satoshis} sats) ${scriptStr}>`
  }

  static fromBufferReader(br) {
    let obj = {satoshis: br.readUInt64LEBN()}
    let size = br.readVarintNum()
    if (size !== 0) {
      obj.script = br.read(size)
    } else {
      obj.script = Buffer.alloc(0)
    }
    return new Output(obj)
  }

  toBufferWriter(writer = new BufferWriter()) {
    writer.writeUInt64LEBN(this._satoshis)
    let script = this._scriptBuffer
    writer.writeVarintNum(script.length)
    writer.write(script)
    return writer
  }
}

module.exports = Output
