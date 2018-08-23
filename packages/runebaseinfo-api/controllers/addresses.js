const runebaseinfo = require('runebaseinfo-lib')
const {ErrorResponse} = require('../components/utils')
const {Networks} = runebaseinfo
const {Base58Check, SegwitAddress} = runebaseinfo.encoding

class AddressController {
  constructor(node) {
    this.node = node
    this.errorResponse = new ErrorResponse({log: this.node.log})
    this._network = this.node.network
    if (this.node.network === 'livenet') {
      this._network = 'mainnet'
    } else if (this.node.network === 'regtest') {
      this._network = 'testnet'
    }
  }

  async show(ctx) {
    let options = {noTxList: Number.parseInt(ctx.query.noTxList)}
    if (ctx.query.from && ctx.query.to) {
      options.from = Number.parseInt(ctx.query.from)
      options.to = Number.parseInt(ctx.query.to)
    }
    try {
      ctx.body = await this.getAddressSummary(ctx.addresses, options)
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async balance(ctx) {
    await this.addressSummarySubQuery(ctx, 'balance')
  }

  async totalReceived(ctx) {
    await this.addressSummarySubQuery(ctx, 'totalReceived')
  }

  async totalSent(ctx) {
    await this.addressSummarySubQuery(ctx, 'totalSent')
  }

  async unconfirmedBalance(ctx) {
    await this.addressSummarySubQuery(ctx, 'unconfirmedBalance')
  }

  async stakingBalance(ctx) {
    await this.addressSummarySubQuery(ctx, 'stakingBalance')
  }

  async matureBalance(ctx) {
    await this.addressSummarySubQuery(ctx, 'matureBalance')
  }

  async addressSummarySubQuery(ctx, param) {
    try {
      let data = await this.getAddressSummary(ctx.addresses)
      ctx.body = {[param]: data[param]}
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async getAddressSummary(address, options) {
    let summary = await this.node.getAddressSummary(address, options)
    let tokenBalances = await this.node.getAllQRC20TokenBalances(address)
    return {
      balance: summary.balance,
      totalReceived: summary.totalReceived,
      totalSent: summary.totalSent,
      unconfirmed: summary.unconfirmed,
      staking: summary.staking,
      mature: summary.mature,
      tokenBalances: tokenBalances.map(token => ({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        totalSupply: token.totalSupply,
        balance: token.balance
      })),
      ranking: summary.ranking,
      blocksMined: summary.blocksMined,
      totalCount: summary.totalCount,
      transactions: summary.transactions
    }
  }

  async checkAddresses(ctx, next) {
    let addresses = (ctx.params.address || '').split(',')
    if (addresses.length === 0) {
      this.errorResponse.handleErrors(ctx, {
        message: 'Must include address',
        code: 1
      })
    } else {
      ctx.addresses = addresses.map(this._toHexAddress.bind(this))
    }
    await next()
  }

  async utxo(ctx) {
    try {
      ctx.body = await this.node.getAddressUnspentOutputs(ctx.addresses)
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async fullTxs(ctx) {
    let from = Number.parseInt(ctx.query.from) || 0
    let to = Number.parseInt(ctx.query.to) || from + 10
    try {
      let result = await this.node.getAddressHistory(ctx.addresses, {from, to})
      ctx.body = {
        totalCount: result.totalCount,
        from,
        to: Math.min(to, result.totalCount),
        transactions: result.transactions
      }
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async balanceTxs(ctx) {
    let from = Number.parseInt(ctx.query.from) || 0
    let to = Number.parseInt(ctx.query.to) || from + 10
    try {
      let result = await this.node.getAddressBalanceHistory(ctx.addresses, {from, to})
      ctx.body = {
        totalCount: result.totalCount,
        from,
        to: Math.min(to, result.totalCount),
        transactions: result.transactions.map(tx => Object.assign(tx, {amount: tx.amount.toString()}))
      }
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async tokenTxs(ctx) {
    let from = Number.parseInt(ctx.query.from) || 0
    let to = Number.parseInt(ctx.query.to) || from + 10
    let tokens = null
    if (ctx.query.tokens) {
      tokens = ctx.query.tokens.split(',')
    } else {
      tokens = 'all'
    }
    try {
      let result = await this.node.getAddressTokenBalanceHistory(ctx.addresses, tokens, {from, to})
      ctx.body = {
        totalCount: result.totalCount,
        from,
        to: Math.min(to, result.totalCount),
        transactions: result.transactions
      }
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
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

module.exports = AddressController
