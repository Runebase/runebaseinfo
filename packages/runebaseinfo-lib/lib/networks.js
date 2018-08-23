const {isObject} = require('util')
const BufferUtil = require('./util/buffer')

let networks = []
let networkMaps = new Map()

class Network {
  constructor(options) {
    this.name = options.name
    this.alias = options.alias
    this.pubkey = this.pubkeyhash = options.pubkeyhash
    this.privatekey = options.privatekey
    this.scripthash = options.scripthash
    this.xpubkey = options.xpubkey
    this.xprivkey = options.xprivkey
    this.witness_v0_keyhash = this.witness_v0_scripthash = options.witness_v0_keyhash
    if (options.networkMagic) {
      this.networkMagic = BufferUtil.integerAsBuffer(options.networkMagic)
    }
    if (options.port) {
      this.port = options.port
    }
    if (options.dnsSeeds) {
      this.dnsSeeds = options.dnsSeeds
    }
  }

  toString() {
    return this.name
  }

  static get(arg, keys) {
    if (networks.includes(arg)) {
      return arg
    }
    if (keys) {
      if (!Array.isArray(keys)) {
        keys = [keys]
      }
      let containsArg = key => networks[index][key] === arg
      for (let network of networks) {
        if (keys.some(key => network[key] === arg)) {
          return network
        }
      }
    }
    return networkMaps.get(arg)
  }

  static add(options) {
    let network = new Network(options)
    for (let value of Object.values(network)) {
      if (value !== undefined && !isObject(value)) {
        networkMaps.set(value, network)
      }
    }
    networks.push(network)
    return network
  }

  static remove(network) {
    let index = networks.indexOf(network)
    if (index >= 0) {
      networks.splice(index, 1)
    }
    for (let [key, value] of networkMaps) {
      if (value === network) {
        networkMaps.delete(key)
      }
    }
  }
}

Network.add({
  name: 'livenet',
  alias: 'mainnet',
  pubkeyhash: 0x3a,
  privatekey: 0x80,
  scripthash: 0x32,
  xpubkey: 0x0488b21e,
  xprivkey: 0x0488ade4,
  witness_v0_keyhash: 'qc',
  networkMagic: 0xf1cfa6d3,
  port: 3888,
  dnsSeeds: []
})
let livenet = Network.get('livenet')

Network.add({
  name: 'testnet',
  alias: 'regtest',
  pubkeyhash: 0x78,
  privatekey: 0xef,
  scripthash: 0x6e,
  witness_v0_keyhash: 'tq',
  xpubkey: 0x043587cf,
  xprivkey: 0x04358394
})
let testnet = Network.get('testnet')
let TESTNET = {
  PORT: 13888,
  NETWORK_MAGIC: BufferUtil.integerAsBuffer(0x0d221506),
  DNS_SEEDS: []
}
networkMaps.set(TESTNET.PORT, testnet)

let REGTEST = {
  PORT: 23888,
  NETWORK_MAGIC: BufferUtil.integerAsBuffer(0xfdddc6e1),
  DNS_SEEDS: []
}
networkMaps.set(REGTEST.PORT, testnet)

Object.defineProperty(testnet, 'port', {
  enumerable: true,
  configurable: false,
  get() {
    return this.regtestEnabled ? REGTEST.PORT : TESTNET.PORT
  }
})
Object.defineProperty(testnet, 'networkMagic', {
  enumerable: true,
  configurable: false,
  get() {
    return this.regtestEnabled ? REGTEST.NETWORK_MAGIC : TESTNET.NETWORK_MAGIC
  }
})
Object.defineProperty(testnet, 'dnsSeeds', {
  enumerable: true,
  configurable: false,
  get() {
    return this.regtestEnabled ? REGTEST.DNS_SEEDS : TESTNET.DNS_SEEDS
  }
})

function enableRegtest() {
  testnet.regtestEnabled = true
}

function disableRegtest() {
  testnet.regtestEnabled = false
}

exports.add = Network.add
exports.remove = Network.remove
exports.get = Network.get
exports.defaultNetwork = livenet
exports.livenet = exports.mainnet = livenet
exports.testnet = testnet
exports.enableRegtest = enableRegtest
exports.disableRegtest = disableRegtest
