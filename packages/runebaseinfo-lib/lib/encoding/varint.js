const BN = require('../crypto/bn')
const BufferWriter = require('./bufferwriter')
const BufferReader = require('./bufferreader')

class Varint {
  constructor(buf) {
    if (Buffer.isBuffer(buf)) {
      this.buf = buf
    } else if (typeof buf === 'number') {
      this.fromNumber(num)
    } else if (buf instanceof BN) {
      this.fromBN(buf)
    } else if (buf) {
      this.set(buf)
    }
  }

  set(obj) {
    this.buf = obj.buf || this.buf
    return this
  }

  fromString(str) {
    this.set({buf: Buffer.from(str, 'hex')})
    return this
  }

  toString() {
    return this.buf.toString('hex')
  }

  fromBuffer(buf) {
    this.buf = buf
  }

  fromBufferReader(br) {
    this.buf = br.readVarintBuf()
    return this
  }

  fromBN(bn) {
    this.buf = new BufferedWriter().writeVarintBN(bn).concat()
    return this
  }

  fromNumber(num) {
    this.buf = new BufferWriter().writeVarintNum(num).concat()
  }

  toBuffer() {
    return this.buf
  }

  toBN() {
    return new BufferReader(this.buf).readVarintBN()
  }

  toNumber() {
    return new BufferReader(this.buf).readVarintNum()
  }
}

module.exports = Varint
