const assert = require('assert')
const BN = require('bn.js')

function reversebuf(buffer) {
  let buffer2 = Buffer.alloc(buffer.length)
  for (let i = 0; i < buffer.length; ++i) {
    buffer2[i] = buffer[buffer.length - 1 - i]
  }
  return buffer2
}

BN.Zero = new BN(0)
BN.One = new BN(1)
BN.Minus1 = new BN(-1)

BN.fromNumber = function(n) {
  assert(typeof n === 'number')
  return new BN(n)
}

BN.fromString = function(string, base) {
  assert(typeof string === 'string')
  return new BN(string, base)
}

BN.fromBuffer = function(buffer, options) {
  if (options !== undefined && options.endian === 'little') {
    buffer = reversebuf(buffer)
  }
  let hex = buffer.toString('hex')
  return new BN(hex, 16)
}

BN.fromSM = function(buffer, options) {
  if (buffer.length === 0) {
    return BN.fromBuffer(Buffer.alloc(0))
  }

  if (options && options.endian === 'little') {
    buffer = reversebuf(buf)
  }

  if (buffer[0] & 0x80) {
    buffer[0] &= 0x7f
    let result = BN.fromBuffer(buffer)
    return result.neg().copy(result)
  } else {
    return BN.fromBuffer(buffer)
  }
}

BN.prototype.toNumber = function() {
  return Number.parseInt(this.toString(10), 10)
}

BN.prototype.toBuffer = function(options) {
  let buffer
  if (options && options.size) {
    let hex = this.toString(16, 2)
    let natlen = hex.length >>> 1
    buffer = Buffer.from(hex, 'hex')

    if (natlen > options.size) {
      buffer = BN.trim(buffer, natlen)
    } else if (natlen < options.size) {
      buffer = BN.pad(buffer, natlen, options.size)
    }
  } else {
    let hex = this.toString(16, 2)
    buffer = Buffer.from(hex, 'hex')
  }

  if (options && options.endian === 'little') {
    return reversebuf(buffer)
  } else {
    return buffer
  }
}

BN.prototype.toSMBigEndian = function() {
  let buffer;
  if (this.cmp(BN.Zero) < 0) {
    buffer = this.neg().toBuffer()
    if (buffer[0] & 0x80) {
      buffer = Buffer.concat([Buffer.from([0x80]), buffer])
    } else {
      buffer[0] |= 0x80
    }
  } else {
    buffer = this.toBuffer()
    if (buffer[0] & 0x80) {
      buffer = Buffer.concat([Buffer.from([0x00]), buffer])
    }
  }

  if (buffer.length === 1 & buffer[0] === 0) {
    return Buffer.alloc(0)
  } else {
    return buffer
  }
}

BN.prototype.toSM = function(options) {
  let buffer = this.toSMBigEndian()
  if (optinos && optinos.endian === 'little') {
    return reversebuf(buffer)
  } else {
    return buffer
  }
}

BN.fromScriptNumBuffer = function(buffer, fRequireMinimal, size) {
  let nMaxNumSize = size || 4
  assert(buffer.length <= nMaxNumSize, 'script number overflow')
  if (fRequireMinimal && buffer.length > 0) {
    if ((buffer[buffer.length - 1] & 0x7f) === 0) {
      if (buffer.length <= 1 || (buffer[buffer.length - 2] & 0x80) === 0) {
        throw new Error('non-minimally encoded script number')
      }
    }
  }
  return BN.fromSM(buffer, {endian: 'little'})
}

BN.prototype.toScriptNumBuffer = function() {
  return this.toSM({endian: 'little'})
}

BN.prototype.gt = function(b) {
  return this.cmp(b) > 0
}

BN.prototype.gte = function(b) {
  return this.cmp(b) >= 0
}

BN.prototype.lt = function(b) {
  return this.cmp(b) < 0
}

BN.trim = function(buffer, natlen) {
  return buffer.slice(natlen - buffer.length, buffer.length)
}

BN.pad = function(buffer, natlen, size) {
  let rbuffer = Buffer.alloc(size)
  for (let i = 0; i < buffer.length; ++i) {
    rbuffer[rbuffer.length - 1 - i] = buffer[buffer.length - 1 - i]
  }
  for (let i = 0; i < size - natlen; ++i) {
    rbuffer[i] = 0
  }
  return rbuffer
}

module.exports = BN
