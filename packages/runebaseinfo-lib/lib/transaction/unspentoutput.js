const assert = require('assert')
const {isObject} = require('util')
const Address = require('../address')
const Script = require('../script')
const Unit = require('../unit')

class UnspentOutput {
  constructor(data) {
    assert(isObject(data), 'Must provide an object from where to extract data')
    let address = data.address && new Address(data.address)
    let txId = data.txid || data.txId
    assert(/^[0-9A-Fa-f]{64}$/.test(txId), 'Invalid TXID in object ' + JSON.stringify(data))
    let outputIndex = 'vout' in data ? data.vout : data.outputIndex
    assert(Number.isInteger(outputIndex), 'Invalid outputIndex, received ' + outputIndex)
    assert('scriptPubKey' in data || 'script' in data, 'Must provide the scriptPubKey for that output')
    let script = new Script(data.scriptPubKey || data.script)
    assert('amount' in data || 'satoshis' in data, 'Must provide an amount for the output')
    let amount = 'amount' in data ? new Unit.fromBTC(data.amount).toSatoshis() : data.satoshis
    assert(Number.isInteger(amount), 'Amount must be a number')
    Object.assign(this, {address, txId, outputIndex, script, satoshis: amount})
  }

  inspect() {
    return `<UnspentOutput: ${this.txId}:${this.outputIndex}, satoshis: ${this.satoshis}, address: ${this.address}>`
  }

  toString() {
    return this.txId + ':' + this.outputIndex
  }

  static fromObject(data) {
    return new UnspentOutput(data)
  }

  toObject() {
    return {
      address: this.address ? this.address.toString() : undefined,
      txid: this.txId,
      vout: this.outputIndex,
      scriptPubKey: this.script.toBuffer().toString('hex'),
      amount: Unit.fromSatoshis(this.satoshis).toBTC(),
      satoshis: this.satoshis
    }
  }

  toJSON() {
    return this.toObject()
  }
}

module.exports = UnspentOutput
