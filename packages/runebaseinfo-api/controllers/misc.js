const runebaseinfo = require('runebaseinfo-lib')
const Block = require('runebaseinfo-node/lib/models/block')
const Transaction = require('runebaseinfo-node/lib/models/transaction')
const {ErrorResponse} = require('../components/utils')
const {Networks} = runebaseinfo
const {Base58Check, SegwitAddress} = runebaseinfo.encoding

class MiscController {
  constructor(node) {
    this.node = node
    this._client = this.node.getRpcClient()
    this.errorResponse = new ErrorResponse({log: this.node.log})
    this._network = this.node.network
    if (this.node.network === 'livenet') {
      this._network = 'mainnet'
    } else if (this.node.network === 'regtest') {
      this._network = 'testnet'
    }
  }

  async info(ctx) {
    let supply
    let height = this.node.getBlockTip().height
    if (height <= 5000) {
      supply = height * 20000
    } else {
      supply = 1e8
      let reward = 4
      let interval = 985500
      height -= 5000
      let halvings = 0
      while (halvings < 7 && height > interval) {
        result += interval * (reward >>> halvings++)
        height -= interval
      }
      supply += height * (reward >>> halvings)
    }
    let netStakeWeight
    try {
      netStakeWeight = (await this._client.getStakingInfo()).netstakeweight
    } catch (err) {}
    ctx.body = {
      height: this.node.getBlockTip().height,
      supply,
      circulatingSupply: supply - 12e6,
      netStakeWeight
    }
  }

  supply(ctx) {
    let height = this.node.getBlockTip().height
    if (height <= 5000) {
      ctx.body = height * 20000
      return
    }
    let result = 1e8
    let reward = 4
    let interval = 985500
    height -= 5000
    let halvings = 0
    while (halvings < 7 && height > interval) {
      result += interval * (reward >>> halvings++)
      height -= interval
    }
    ctx.body = result + height * (reward >>> halvings)
  }

  circulatingSupply(ctx) {
    let height = this.node.getBlockTip().height
    if (height <= 5000) {
      ctx.body = height * 20000 - 12e6
      return
    }
    let result = 1e8
    let reward = 4
    let interval = 985500
    height -= 5000
    let halvings = 0
    while (halvings < 7 && height > interval) {
      result += interval * (reward >>> halvings++)
      height -= interval
    }
    ctx.body = result + height * (reward >>> halvings) - 12e6
  }

  async classify(ctx) {
    let id = ctx.params.id
    if (/^(0|[1-9]\d{0,9})$/.test(id)) {
      id = Number.parseInt(id)
      if (id <= this.node.getBlockTip().height) {
        ctx.body = {type: 'block'}
        return
      }
    } else if ([34, 42, 62].includes(id.length)) {
      try {
        this._toHexAddress(id)
        ctx.body = {type: 'address'}
        return
      } catch (err) {}
    } else if (id.length === 40) {
      if (await this.node.getContract(id)) {
        ctx.body = {type: 'contract'}
        return
      }
    } else if (id.length === 64) {
      if (await Block.findOne({hash: id})) {
        ctx.body = {type: 'block'}
        return
      } else if (await Transaction.findOne({$or: [{id}, {hash: id}]})) {
        ctx.body = {type: 'transaction'}
        return
      }
    }
    if (/^[0-9a-z ]+$/i.test(id)) {
      let token = await this.node.searchQRC20Token(id)
      if (token) {
        ctx.body = {type: 'contract', id: token.address}
        return
      }
    }
    ctx.throw(404)
  }

  async richList(ctx) {
    let from = Number.parseInt(ctx.query.from) || 0
    let to = Number.parseInt(ctx.query.to) || from + 10
    ctx.body = await this.node.getRichList({from, to})
  }

  async biggestMiners(ctx) {
    let from = Number.parseInt(ctx.query.from) || 0
    let to = Number.parseInt(ctx.query.to) || from + 10
    ctx.body = await this.node.getMiners({from, to})
  }

  _toHexAddress(address) {
    let network = Networks.get(this._network)
    if (address.length === 34) {
      let hexAddress = Base58Check.decode(address)
      if (hexAddress[0] === network.pubkeyhash) {
        return {type: 'pubkeyhash', hex: hexAddress.slice(1).toString('hex')}
      } else if (hexAddress[0] === network.scripthash) {
        return {type: 'scripthash', hex: hexAddress.slice(1).toString('hex')}
      }
    } else if (address.length === 42) {
      let result = SegwitAddress.decode(network.witness_v0_keyhash, address)
      if (result) {
        return {type: 'witness_v0_keyhash', hex: Buffer.from(result.program).toString('hex')}
      }
    } else if (address.length === 62) {
      let result = SegwitAddress.decode(network.witness_v0_scripthash, address)
      if (result) {
        return {type: 'witness_v0_scripthash', hex: Buffer.from(result.program).toString('hex')}
      }
    }
    throw new Error('Invalid address')
  }
}

module.exports = MiscController
