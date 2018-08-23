const assert = require('assert');
const js = require('./js');
const $ = require('./preconditions');

exports.fill = function(buffer, value) {
  assert(Buffer.isBuffer(buffer))
  assert(Number.isInteger(value))
  for (let i = 0; i < buffer.length; ++i) {
    buffer[i] = value
  }
  return buffer
}

exports.copy = function(original) {
  let buffer = Buffer.alloc(original.length)
  original.copy(buffer)
  return buffer
}

function isBuffer(arg) {
  return Buffer.isBuffer(arg) || arg instanceof Uint8Array
}

exports.isBuffer = isBuffer

exports.emptyBuffer = function(bytes) {
  assert(Number.isInteger(bytes))
  let result = Buffer.alloc(bytes)
  for (let i = 0; i < bytes; ++i) {
    result.write('\0', i)
  }
  return result
}

exports.concat = Buffer.concat

exports.integerAsSingleByteBuffer = function(integer) {
  assert(Number.isInteger(integer))
  return Buffer.from([integer & 0xff])
}

exports.integerAsBuffer = function(integer) {
  assert(Number.isInteger(integer))
  return Buffer.from([
    integer >> 24 & 0xff,
    integer >> 16 & 0xff,
    integer >> 8 & 0xff,
    integer & 0xff
  ])
}

exports.integerFromBuffer = function(buffer) {
  assert(isBuffer(buffer))
  return buffer[0] << 24 | buffer[1] << 16 | buffer[2] << 8 | buffer[3]
}

exports.integerFromSingleByteBuffer = function(buffer) {
  assert(isBuffer(buffer))
  return buffer[0]
}

exports.bufferToHex = function(buffer) {
  assert(isBuffer(buffer))
  return buffer.toString('hex')
}

exports.hexToBuffer = function(string) {
  assert(/^[0-9A-fa-f]*$/.test(string))
  return Buffer.from(string, 'hex')
}

exports.NULL_HASH = Buffer.alloc(32)
exports.EMPTY_BUFFER = Buffer.alloc(0)
