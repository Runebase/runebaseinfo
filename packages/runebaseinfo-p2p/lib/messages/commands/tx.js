const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')

class TransactionMessage extends Message {
  constructor(arg, options) {
    super('tx', options)
    this.Transaction = options.Transaction
    assert(
      arg === undefined || arg instanceof this.Transaction,
      'An instance of Transaction or undefined is expected'
    )
    this.transaction = arg || new this.Transaction()
  }

  setPayload(payload) {
    if ('fromBuffer' in this.Transaction.prototype) {
      this.transaction = new this.Transaction().fromBuffer(payload)
    } else {
      this.transaction = this.Transaction.fromBuffer(payload)
    }
  }

  getPayload() {
    if ('toRaw' in this.Transaction.prototype) {
      return this.transaction.toRaw()
    } else {
      return this.transaction.toBuffer()
    }
  }
}

module.exports = TransactionMessage
