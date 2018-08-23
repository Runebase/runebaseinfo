const assert = require('assert')
const abi = require('ethjs-abi')

class Contract {
  constructor(abiJson) {
    this.abiJson = abiJson
  }

  encodeMethod(name, ...args) {
    let method = this.abiJson.find(item => item.name === name && item.type === 'function')
    assert(method)
    return abi.encodeMethod(method, [...args])
  }

  decodeMethod(name, data) {
    let method = this.abiJson.find(item => item.name === name && item.type === 'function')
    assert(method)
    return abi.decodeMethod(method, data)
  }

  encodeEvent(name, ...args) {
    let event = this.abiJson.find(item => item.name === name && item.type === 'event')
    assert(event)
    return abi.encodeEvent(event, [...args])
  }

  decodeEvent(name, data) {
    let event = this.abiJson.find(item => item.name === name && item.type === 'event')
    assert(event)
    return abi.decodeEvent(event, data)
  }

  eventSignature(name) {
    let event = this.abiJson.find(item => item.name === name && item.type === 'event')
    assert(event)
    return abi.eventSignature(event)
  }
}

module.exports = Contract
