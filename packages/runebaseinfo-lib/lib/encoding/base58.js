const bs58 = require('bs58');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.split('');

class Base58 {
  constructor(obj) {
    if (Buffer.isBuffer(obj)) {
      this.fromBuffer(obj)
    } else if (typeof obj === 'string') {
      this.fromString(obj)
    } else if (obj) {
      this.set(obj)
    }
  }

  validCharacters(chars) {
    if (Buffer.isBuffer(chars)) {
      chars = chars.toString()
    }
    return chars.every(char => ALPHABET.contains(char))
  }

  set(obj) {
    this.buf = obj.buf || this.buf || undefined
    return this
  }

  static encode(buf) {
    if (!Buffer.isBuffer) {
      throw new TypeError('Input should be a buffer')
    }
    return bs58.encode(buf)
  }

  static decode(str) {
    if (typeof str !== 'string') {
      throw new TypeError('Input should be a string')
    }
    return Buffer.from(bs58.decode(str))
  }

  fromBuffer(buf) {
    this.buf = buf
    return this
  }

  fromString(str) {
    this.buf = Base58.decode(str)
    return this
  }

  toBuffer() {
    return this.buf
  }

  toString() {
    return Base58.encode(this.buf)
  }
}

module.exports = Base58;
