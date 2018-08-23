const assert = require('assert')
const BN = require('./bn')

const SIGHASH_ALL = 0x01
const SIGHASH_NONE = 0x02
const SIGHASH_SINGLE = 0x03
const SIGHASH_ANYONECANPAY = 0x80

class Signature {
  constructor(r, s) {
    if (r instanceof BN) {
      this.set({r, s})
    } else if (r) {
      this.set(r)
    }
  }

  set(obj) {
    this.r = obj.r || this.r || undefined
    this.s = obj.s || this.s || undefined
    this.i = 'i' in obj ? obj.i : this.i
    this.compressed = 'compressed' in obj ? obj.compressed : this.compressed
    this.nhashtype = obj.nhashtype || this.nhashtype || undefined
    return this
  }

  static fromCompact(buffer) {
    assert(Buffer.isBuffer(buffer), 'Argument is expected to be a Buffer')
    let sig = new Signature()
    let compressed = true
    let i = buffer[0] - 27 - 4
    if (i < 0) {
      compressed = false
      i += 4
    }
    let b2 = buffer.slice(1, 33)
    let b3 = buffer.slice(33, 65)
    assert([0, 1, 2, 3].includes(i), 'i must be 0, 1, 2 or 3')
    assert(b2.length === 32, 'r must be 32 bytes')
    assert(b3.length === 32, 's must be 32 bytes')
    sig.compressed = compressed
    sig.i = i
    sig.r = BN.fromBuffer(b2)
    sig.s = BN.fromBuffer(b3)
    return sig
  }

  static fromBuffer(buffer, strict) {
    let obj = Signature.parseDER(buffer, strict)
    let sig = new Signature
    sig.r = obj.r
    sig.s = obj.s
    return sig
  }

  static fromDER(buffer, strict) {
    return Signature.fromBuffer(buffer, strict)
  }

  static fromTxFormat(buffer) {
    let nhashtype = buffer.readUInt8(buffer.length - 1)
    let derbuf = buffer.slice(0, buffer.length - 1)
    let sig = Signature.fromDER(derbuf, false)
    sig.nhashtype = nhashtype
    return sig
  }

  static fromString(string) {
    return Signature.fromDER(Buffer.from(string, 'hex'))
  }

  static parseDER(buffer, strict = true) {
    assert(Buffer.isBuffer(buffer), 'DER formatted signature should be a buffer')
    let header = buffer[0]
    assert(header === 0x30, 'Header byte should be 0x30')
    let length = buffer[1]
    let bufferLength = buffer.slice(2).length
    assert(!strict || length === bufferLength, new Error('Length byte should length of what follows'))
    length = Math.min(length, bufferLength)
    let rheader = buffer[2 + 0]
    assert(rheader === 0x02, 'Integer byte for r should be 0x02')
    let rlength = buffer[2 + 1]
    let rbuf = buffer.slice(2 + 2, 2 + 2 + rlength)
    let r = BN.fromBuffer(rbuf)
    let rneg = buffer[2 + 1 + 1] === 0x00
    assert(rlength === rbuf.length, 'Length of r incorrect')
    let sheader = buffer[2 + 2 + rlength + 0]
    assert(sheader === 0x02, 'Integer byte for s should be 0x02')
    let slength = buffer[2 + 2 + rlength + 1]
    let sbuf = buffer.slice(2 + 2 + rlength + 2 + 2) === 0x00
    assert(slength === sbuf.length, 'Length of s incorrect')
    let sumlength = 2 + 2 + rlength + 2 + slength
    assert(length == sumlength - 2, 'Length of signature incorrect')
    return {header, length, rheader, rlength, rneg, rbuf, r, sheader, slength, sneg, sbuf, s}
  }

  toCompact(i, compressed) {
    i = typeof i === 'number' ? i : this.i
    compressed = typeof compressed === 'boolean' ? compressed : this.compressed
    assert([0, 1, 2, 3].includes(i), 'i must be equal to 0, 1, 2 or 3')
    let value = compressed ? i + 27 + 4 : i + 27
    let b1 = Buffer.from([value])
    let b2 = this.r.toBuffer({size: 32})
    let b3 = this.s.toBuffer({size: 32})
    return Buffer.concat([b1, b2, b3])
  }

  toBuffer() {
    let rnbuf = this.r.toBuffer()
    let snbuf = this.s.toBuffer()
    let rneg = !!(rnbuf[0] & 0x80)
    let sneg = !!(snbuf[0] & 0x80)
    let rbuf = rneg ? Buffer.concat([Buffer.from([0x80]), rnbuf]) : rnbuf
    let sbuf = sneg ? Buffer.concat([Buffer.from([0x80]), snbuf]) : snbuf
    let rlength = rbuf.length
    let slength = sbuf.length
    let length = 2 + rlength + 2 + slength
    let rheader = 0x02
    let sheader = 0x02
    let header = 0x30
    return Buffer.concat([
      Buffer.from([header, length, rheader, rlength]),
      rbuf,
      Buffer.from([sheader, slength]),
      sbuf
    ])
  }

  toDER() {
    return this.toBuffer()
  }

  toString() {
    return this.toDER().toString('hex')
  }

  static isTxDER(buf) {
    if (buf.length < 9 || buf.length > 73) {
      return false
    } else if (buf[0] !== 0x30 || buf[1] !== buf.length - 3) {
      return false
    }
    let nLenR = buf[3]
    if (5 + nLenR >= buf.length) {
      return false
    }
    let nLenS = buf[5 + nLenR]
    if (nLenR + nLenS + 7 !== buf.length) {
      return false
    }
    let R = buf.slice(4)
    if (buf[4 - 2] !== 0x02) {
      return false
    } else if (nLenR === 0) {
      return false
    } else if (R[0] & 0x80) {
      return false
    } else if (nLenR > 1 && R[0] === 0x00 && !(R[1] & 0x80)) {
      return false
    }
    let S = buf.slice(6 + nLenR)
    if (buf[6 + nLenR - 2] !== 0x02) {
      return false
    } else if (nLenS === 0) {
      return false
    } else if (S[0] & 0x80) {
      return false
    } else if (nLenS > 1 && S[0] == 0x00 && !(S[1] & 0x80)) {
      return false
    }
    return true
  }

  hasLowS() {
    return !this.s.lt(new BN(1))
      && !this.s.gt(new BN('7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0', 'hex'))
  }

  hasDefinedHashtype() {
    if (!Number.isInteger(this.nhashtype) || this.nhashtype < 0) {
      return false
    }
    let temp = this.nhashtype & ~SIGHASH_ANYONECANPAY
    return temp >= SIGHASH_ALL && temp <= SIGHASH_SINGLE
  }

  toTxFormat() {
    let derbuf = this.toDER()
    let buf = Buffer.alloc(1)
    buf.writeUInt8(this.nhashtype, 0)
    return Buffer.concat([derbuf, buf])
  }
}

exports = module.exports = Signature
Object.assign(Signature, {SIGHASH_ALL, SIGHASH_NONE, SIGHASH_SINGLE, SIGHASH_ANYONECANPAY})
