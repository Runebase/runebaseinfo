const assert = require('assert')
const Message = require('../message')
const BloomFilter = require('../../bloomfilter')

class FilterloadMessage extends Message {
  constructor(arg, options) {
    super('filterload', options)
    assert(
      arg === undefined || arg instanceof BloomFilter,
      'An instance of BloomFilter or undefined is expected'
    )
    this.filter = arg
  }

  setPayload(payload) {
    this.filter = BloomFilter.fromBuffer(payload)
  }

  getPayload() {
    return this.filter ? this.filter.toBuffer() : Buffer.alloc(0)
  }
}

module.exports = FilterloadMessage
