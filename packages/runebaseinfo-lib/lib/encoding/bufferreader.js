const assert = require('assert')
const {isObject, isString} = require('util')
const BN = require('../crypto/bn')

class BufferReader {
  constructor(buf) {
    if (buf === undefined) {
      return
    } else if (Buffer.isBuffer(buf)) {
      this.set({buf})
    } else if (isString(buf)) {
      this.set({buf: Buffer.from(buf, 'hex')})
    } else if (isObject(buf)) {
      this.set(buf)
    } else {
      throw new TypeError('Unrecognized argument for BufferReader')
    }
  }

  set(obj) {
    this.buf = obj.buf || this.buf || undefined
    this.pos = obj.pos || this.pos || 0
    return this
  }

  eof() {
    return this.pos >= this.buf.length
  }

  finished() {
    return this.eof()
  }

  read(length) {
    assert(length !== undefined)
    let buf = this.buf.slice(this.pos, this.pos + length)
    this.pos += length
    return buf
  }

  readHexString(length) {
    let buffer = this.buf.slice(this.pos, this.pos + length)
    this.pos += length
    return buffer.toString('hex')
  }

  readAll() {
    let buf = this.buf.slice(this.pos)
    this.pos = this.buf.length
    return buf
  }

  readUInt8() {
    return this.buf.readUInt8(this.pos++)
  }

  readUInt16BE() {
    let value = this.buf.readUInt16BE(this.pos)
    this.pos += 2
    return value
  }

  readUInt16LE() {
    let value = this.buf.readUInt16LE(this.pos)
    this.pos += 2
    return value
  }

  readUInt32BE() {
    let value = this.buf.readUInt32BE(this.pos)
    this.pos += 4
    return value
  }

  readUInt32LE() {
    let value = this.buf.readUInt32LE(this.pos)
    this.pos += 4
    return value
  }

  readInt32BE() {
    let value = this.buf.readInt32BE(this.pos)
    this.pos += 4
    return value
  }

  readInt32LE() {
    let value = this.buf.readInt32LE(this.pos)
    this.pos += 4
    return value
  }

  readUInt64BEBN() {
    let buf = this.buf.slice(this.pos, this.pos + 8)
    let bn = BN.fromBuffer(buf)
    this.pos += 8
    return bn
  }

  readUInt64LEBN() {
    let second = this.buf.readUInt32LE(this.pos)
    let first = this.buf.readUInt32LE(this.pos + 4)
    if (first < 0x200000) {
      this.pos += 8
      return new BN(first * 0x100000000 + second)
    } else {
      let data = Array.prototype.slice.call(this.buf, this.pos, this.pos + 8)
      this.pos += 8
      return new BN(data, 10, 'le')
    }
  }

  readDoubleBE() {
    let value = this.buf.readDoubleBE(this.pos)
    this.pos += 8
    return value
  }

  readVarintNum() {
    let first = this.readUInt8()
    switch (first) {
    case 0xfd:
      return this.readUInt16LE()
    case 0xfe:
      return this.readUInt32LE()
    case 0xff:
      let bn = this.readUInt64LEBN()
      let n = bn.toNumber()
      if (n < 0x20000000000000) {
        return n
      } else {
        throw new Error('number to large to retain precision - use readVarintBN')
      }
      break
    default:
      return first
    }
  }

  readVarLengthBuffer() {
    let length = this.readVarintNum()
    let buf = this.read(length)
    assert(
      buf.length === length,
      'Invalid length while reading varlength buffer. '
      + `Expected to read: ${length} and read ${buf.length}`
    )
    return buf
  }

  readVarintBuf() {
    let first = this.buf.readUInt8(this.pos)
    switch (first) {
    case 0xfd:
      return this.read(1 + 2)
    case 0xfe:
      return this.read(1 + 4)
    case 0xff:
      return this.read(1 + 8)
    default:
      return this.read(1)
    }
  }

  readVarintBN() {
    let first = this.readUInt8()
    switch (first) {
    case 0xfd:
      return new BN(this.readUInt16LE())
    case 0xfe:
      return new BN(this.readUInt32LE())
    case 0xff:
      return this.readUInt64LEBN()
    default:
      return new BN(first)
    }
  }

  reverse() {
    let buf = Buffer.alloc(this.buf.length)
    for (let i = 0; i < buf.length; ++i) {
      buf[i] = this.buf[this.buf.length - 1 - i]
    }
    this.buf = buf
    return this
  }

  readReverse(length) {
    if (length === undefined) {
      length = this.buf.length
    }
    let buf = this.buf.slice(this.pos, this.pos + length)
    this.pos += length
    return Buffer.from(buf).reverse()
  }
}

module.exports = BufferReader
