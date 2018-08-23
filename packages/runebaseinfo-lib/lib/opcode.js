const assert = require('assert')
const opcodes = require('runebase-opcodes')

class Opcode {
  constructor(num) {
    if (typeof num === 'number') {
      this.num = num
    } else if (typeof num === 'string') {
      this.num = Opcode.map[num]
    } else {
      throw new TypeError(`Unrecognized num type: "${typeof num}" for Opcode`)
    }
  }

  static fromBuffer(buffer) {
    assert(Buffer.isBuffer(buffer))
    return new Opcode(Number('0x' + buffer.toString('hex')))
  }

  static fromNumber(num) {
    assert(typeof num === 'number')
    return new Opcode(num)
  }

  static fromString(string) {
    assert(typeof string === 'string')
    let value = Opcode.map[string]
    if (string in Opcode.map) {
      return new Opcode(Opcode.map[string])
    } else {
      throw new TypeError('Invalid opcodestr')
    }
  }

  toHex() {
    return this.num.toString(16)
  }

  toBuffer() {
    return Buffer.from(this.toHex(), 'hex')
  }

  toNumber() {
    return this.num
  }

  toString() {
    if (this.num in Opcode.reverseMap) {
      return Opcode.reverseMap[this.num]
    } else {
      throw new Error('Opcode does not have a string representation')
    }
  }

  static smallInt(n) {
    assert(typeof n === 'number', 'Invalid Argument: n should be number')
    assert(n >= 0 && n <= 16, 'Invalid Argument: n numst be between 0 and 16')
    if (n === 0) {
      return new Opcode('OP_0')
    } else {
      return new Opcode(Opcode.map.OP_1 + n - 1)
    }
  }

  static isSmallIntOp(opcode) {
    if (opcode instanceof Opcode) {
      opcode = opcode.toNumber()
    }
    return opcode === Opcode.map.OP_0 || (opcode >= Opcode.map.OP_1 && opcode <= Opcode.map.OP_16)
  }

  inspect() {
    return `<Opcode: ${this.toString()}, hex: ${this.toHex()}, decimal: ${this.num}>`
  }
}

Opcode.map = opcodes
Opcode.reverseMap = []
for (let [key, value] of Object.entries(Opcode.map)) {
  Opcode.reverseMap[value] = key
}

Object.assign(Opcode, Opcode.map)

module.exports = Opcode
