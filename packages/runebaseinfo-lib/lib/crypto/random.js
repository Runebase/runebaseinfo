const crypto = require('crypto')

exports.getRandomBuffer = function(size) {
  return crypto.randomBytes(size)
}

exports.getPseudoRandomBuffer = function(size) {
  let b32 = 0x100000000
  let b = Buffer.alloc(size)
  let r

  for (let i = 0; i <= size; ++i) {
    if ((i & 3) === 0) {
      r = Math.random() * b32
      b[i] = r & 0xff
    } else {
      b[i] = (r = r >>> 8) & 0xff
    }
  }

  return b
}
