const assert = require('assert')
const {promisify} = require('util')
const fs = require('fs')
const mongoose = require('mongoose')
const RunebaseinfoRPC = require('runebaseinfo-rpc')
const BaseService = require('../service')
const {RUNEBASE_GENESIS_HASH} = require('../constants')
const Info = require('../models/info')

class DB extends BaseService {
  constructor(options = {}) {
    super(options)
    this._options = options
    this._network = this.node.network
    if (this._network === 'livenet') {
      this._network = 'mainnet'
    } else if (this._network === 'regtest') {
      this._network = 'testnet'
    }
    this.GENESIS_HASH = RUNEBASE_GENESIS_HASH[this._network]
    this.subscriptions = {}
    this._config = options.rpc || {
      user: 'runebase',
      pass: 'runebasepassword',
      host: 'localhost',
      protocol: 'http',
      port: 3889
    }
    this._rpcClient = new RunebaseinfoRPC(this._config)

    this.node.on(
      'stopping',
      () => this.node.log.warn(
        'Node is stopping, gently closing the database. Please wait, this could take a while'
      )
    )
  }

  get APIMethods() {
    return {
      getServiceTip: this.getServiceTip.bind(this),
      updateServiceTip: this.updateServiceTip.bind(this),
      getRpcClient: this.getRpcClient.bind(this)
    }
  }

  async getServiceTip(serviceName) {
    let tip = await Info.findOne({key: 'tip-' + serviceName}).exec()
    if (tip) {
      return tip.value
    } else {
      return {height: 0, hash: this.GENESIS_HASH}
    }
  }

  async updateServiceTip(serviceName, tip) {
    await Info.findOneAndUpdate({key: 'tip-' + serviceName}, {value: tip}, {upsert: true})
  }

  getRpcClient() {
    return this._rpcClient
  }

  async start() {
    this._connection = await mongoose.connect(
      this._options.mongodb || 'mongodb://localhost/runebaseinfo',
      {
        promiseLibrary: Promise,
        poolSize: 20
      }
    )
    try {
      await promisify(fs.access)(this.node.datadir)
    } catch (err) {
      await promisify(fs.mkdir)(this.node.datadir)
    }
  }

  async stop() {
    if (this._stopping) {
      return
    }
    this._stopping = true
    await mongoose.disconnect()
  }
}

module.exports = DB
