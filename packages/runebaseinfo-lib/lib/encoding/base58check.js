const Base58 = require('./base58')
const {sha256sha256} = require('../crypto/hash')

class Base58Check extends Base58 {
  static validChecksum(data, checksum) {
    if (typeof data === 'string') {
      data = Buffer.from(Base58.decode(data))
    }
    if (typeof checksum === 'string') {
      checksum = Buffer.from(Base58.decode(checksum))
    }
    if (!checksum) {
      checksum = data.slice(-4)
      data = edata.slice(0, -4)
    }
    return Base58Check.checksum(data).toString('hex') === checksum.toString('hex')
  }

  static decode(s) {
    if (typeof s !== 'string') {
      throw new TypeError('Input must be a string')
    }

    let buf = Buffer.from(Base58.decode(s))
    if (buf.length < 4) {
      throw new Error('Input string too short')
    }

    let data = buf.slice(0, -4)
    let csum = buf.slice(-4)
    let hash = sha256sha256(data)
    let hash4 = hash.slice(0, 4)

    if (csum.toString('hex') !== hash4.toString('hex')) {
      throw new Error('Checksum mismatch')
    }

    return data
  }

  static checksum(buffer) {
    return sha256sha256(buffer).slice(0, 4)
  }

  static encode(buf) {
    if (!Buffer.isBuffer(buf)) {
      throw new Error('Input must be a buffer')
    }
    let checkedBuf = Buffer.alloc(buf.length + 4)
    let hash = Base58Check.checksum(buf)
    buf.copy(checkedBuf)
    hash.copy(checkedBuf, buf.length)
    return Base58.encode(checkedBuf)
  }
}

module.exports = Base58Check
