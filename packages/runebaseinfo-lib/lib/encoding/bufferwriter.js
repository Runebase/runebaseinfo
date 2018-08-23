const assert = require('assert')
const BN = require('bn.js')

class BufferWriter {
  constructor(obj) {
    if (obj) {
      this.set(obj)
    } else {
      this.bufs = []
    }
  }

  set(obj) {
    this.bufs = obj.bufs || this.bufs || []
    return this
  }

  toBuffer() {
    return this.concat()
  }

  concat() {
    return Buffer.concat(this.bufs)
  }

  write(buf) {
    assert(Buffer.isBuffer(buf))
    this.bufs.push(buf)
    return this
  }

  writeHexString(string) {
    this.bufs.push(Buffer.from(string, 'hex'))
    return this
  }

  writeReverse(buf) {
    assert(Buffer.isBuffer(buf))
    this.bufs.push(Buffer.from(buf).reverse())
    return this
  }

  writeUInt8(n) {
    let buf = Buffer.alloc(1)
    buf.writeUInt8(n, 0)
    this.write(buf)
    return this
  }

  writeUInt16BE(n) {
    let buf = Buffer.alloc(2)
    buf.writeUInt16BE(n, 0)
    this.write(buf)
    return this
  }

  writeUInt16LE(n) {
    let buf = Buffer.alloc(2)
    buf.writeUInt16LE(n, 0)
    this.write(buf)
    return this
  }

  writeUInt32BE(n) {
    let buf = Buffer.alloc(4)
    buf.writeUInt32BE(n, 0)
    this.write(buf)
    return this
  }

  writeUInt32LE(n) {
    let buf = Buffer.alloc(4)
    buf.writeUInt32LE(n, 0)
    this.write(buf)
    return this
  }

  writeInt32BE(n) {
    let buf = Buffer.alloc(4)
    buf.writeInt32BE(n, 0)
    this.write(buf)
    return this
  }

  writeInt32LE(n) {
    let buf = Buffer.alloc(4)
    buf.writeInt32LE(n, 0)
    this.write(buf)
    return this
  }

  writeUInt64BEBN(bn) {
    let buf = bn.toBuffer({size: 8})
    this.write(Buffer.alloc(8 - buf.length))
    this.write(buf)
    return this
  }

  writeUInt64LEBN(bn) {
    let buf = bn.toBuffer({size: 8})
    this.writeReverse(buf)
    this.write(Buffer.alloc(8 - buf.length))
    return this
  }

  writeDoubleBE(n) {
    let buf = Buffer.alloc(8)
    buf.writeDoubleBE(n, 0)
    this.write(buf)
    return this
  }

  writeVarintNum(n) {
    let buf = BufferWriter.varintBufNum(n)
    this.write(buf)
    return this
  }

  writeVarintBN(bn) {
    let buf = BufferWriter.varintBufBN(bn)
    this.write(buf)
    return this
  }

  static varintBufNum(n) {
    if (n < 253) {
      let buf = Buffer.alloc(1)
      buf.writeUInt8(n, 0)
      return buf
    } else if (n < 0x10000) {
      let buf = Buffer.alloc(1 + 2)
      buf.writeUInt8(253, 0)
      buf.writeUInt16LE(n, 1)
      return buf
    } else if (n < 0x100000000) {
      let buf = Buffer.alloc(1 + 4)
      buf.writeUInt8(254, 0)
      buf.writeUInt32LE(n, 1)
      return buf
    } else {
      let buf = Buffer.alloc(1 + 8)
      buf.writeUInt8(255, 0)
      buf.writeInt32LE(n & -1, 1)
      buf.writeUInt32LE(Math.floor(n / 0x100000000), 5)
      return buf
    }
  }

  static varintBufBN(bn) {
    // let n = bn.toNumber()
    if (bn.lt(new BN(0xfd))) {
      let buf = Buffer.alloc(1)
      buf.writeUInt8(bn.toNumber(), 0)
      return buf
    } else if (bn.lt(new BN(0x10000))) {
      let buf = Buffer.alloc(1 + 2)
      buf.writeUInt8(253, 0)
      buf.writeUInt16LE(bn.toNumber(), 1)
      return buf
    } else if (bn.lt(new BN(0x100000000))) {
      let buf = Buffer.alloc(1 + 4)
      buf.writeUInt8(254, 0)
      buf.writeUInt32LE(bn.toNumber(), 1)
      return buf
    } else {
      let bw = new BufferWriter()
      bw.writeUInt8(255)
      bw.writeUInt64LEBN(bn)
      return bw.concat()
    }
  }
}

module.exports = BufferWriter
