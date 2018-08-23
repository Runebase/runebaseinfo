const {CronJob} = require('cron')
const mongoose = require('mongoose')
const runebaseinfo = require('runebaseinfo-lib')
const BaseService = require('../service')
const Block = require('../models/block')
const Transaction = require('../models/transaction')
const TransactionOutput = require('../models/transaction-output')
const Snapshot = require('../models/snapshot')
const {toRawScript} = require('../utils')
const {Address, Networks} = runebaseinfo
const {Base58Check, SegwitAddress} = runebaseinfo.encoding
const {BN} = runebaseinfo.crypto
const {Contract, tokenABI} = runebaseinfo.contract

const tokenAbi = new Contract(tokenABI)
const TOKEN_EVENTS = {
  Transfer: tokenAbi.eventSignature('Transfer').slice(2),
  Approval: tokenAbi.eventSignature('Approval').slice(2),
  Mint: tokenAbi.eventSignature('Mint').slice(2),
  Burn: tokenAbi.eventSignature('Burn').slice(2)
}

class AddressService extends BaseService {
  constructor(options) {
    super(options)
    this._network = this.node.network
    if (this._network === 'livenet') {
      this._network = 'mainnet'
    } else if (this._network === 'regtest') {
      this._network = 'testnet'
    }
  }

  static get dependencies() {
    return ['block', 'db', 'transaction']
  }

  get APIMethods() {
    return {
      getAddressHistory: this.getAddressHistory.bind(this),
      getAddressBalanceHistory: this.getAddressBalanceHistory.bind(this),
      getAddressSummary: this.getAddressSummary.bind(this),
      getAddressUnspentOutputs: this.getAddressUnspentOutputs.bind(this),
      getAddressTransactionCount: this.getAddressTransactionCount.bind(this),
      getBlocksMined: this.getBlocksMined.bind(this),
      getRichList: this.getRichList.bind(this),
      getMiners: this.getMiners.bind(this),
      snapshot: this.snapshot.bind(this)
    }
  }

  async getAddressHistory(addresses, {from = 0, to = 0xffffffff} = {}) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses]
    }
    let [{count, list}] = await Transaction.aggregate([
      {
        $match: {
          $or: [
            {inputAddresses: {$elemMatch: AddressService._constructAddressElementQuery(addresses)}},
            {outputAddresses: {$elemMatch: AddressService._constructAddressElementQuery(addresses)}},
            {
              'receipts.logs': {
                $elemMatch: {
                  'topics.0': {$in: [TOKEN_EVENTS.Transfer, TOKEN_EVENTS.Mint, TOKEN_EVENTS.Burn]},
                  topics: {$in: AddressService._toHexAddresses(addresses)}
                }
              }
            }
          ]
        }
      },
      {
        $facet: {
          count: [{$group: {_id: null, count: {$sum: 1}}}],
          list: [
            {$sort: {'block.height': -1, index: -1}},
            {$skip: from},
            {$limit: to - from},
            {$project: {id: true}}
          ]
        }
      }
    ])
    return {
      totalCount: count.length && count[0].count,
      transactions: list.map(tx => tx.id)
    }
  }

  async getAddressBalanceHistory(addresses, {from = 0, to = 0xffffffff} = {}) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses]
    }
    let [{count, transactions}] = await Transaction.aggregate([
      {
        $match: {
          $or: [
            {inputAddresses: {$elemMatch: AddressService._constructAddressElementQuery(addresses)}},
            {outputAddresses: {$elemMatch: AddressService._constructAddressElementQuery(addresses)}}
          ],
          'block.height': {$gt: 0}
        }
      },
      {
        $facet: {
          count: [{$group: {_id: null, count: {$sum: 1}}}],
          transactions: [
            {$sort: {'block.height': -1, index: -1}},
            {$skip: from},
            {$limit: to - from},
            {$project: {_id: false, id: '$id', block: '$block', inputs: '$inputs', outputs: '$outputs'}},
            {$unwind: '$inputs'},
            {
              $lookup: {
                from: 'transactionoutputs',
                localField: 'inputs',
                foreignField: '_id',
                as: 'input'
              }
            },
            {$unwind: '$input'},
            {
              $group: {
                _id: '$id',
                block: {$first: '$block'},
                index: {$first: '$index'},
                inputAmount: {
                  $sum: {
                    $cond: {
                      if: AddressService._constructAddressCond(addresses, 'input.address'),
                      then: '$input.satoshis',
                      else: mongoose.Types.Long(0)
                    }
                  }
                },
                outputs: {$first: '$outputs'}
              }
            },
            {$unwind: '$outputs'},
            {
              $lookup: {
                from: 'transactionoutputs',
                localField: 'outputs',
                foreignField: '_id',
                as: 'output'
              }
            },
            {$unwind: '$output'},
            {
              $group: {
                _id: '$_id',
                block: {$first: '$block'},
                index: {$first: '$index'},
                inputAmount: {$first: '$inputAmount'},
                outputAmount: {
                  $sum: {
                    $cond: {
                      if: AddressService._constructAddressCond(addresses, 'output.address'),
                      then: '$output.satoshis',
                      else: mongoose.Types.Long(0)
                    }
                  }
                }
              }
            },
            {$sort: {'block.height': -1, index: -1}},
            {
              $project: {
                _id: false,
                id: '$_id',
                block: '$block',
                amount: {$subtract: ['$outputAmount', '$inputAmount']}
              }
            }
          ]
        }
      }
    ])
    return {
      totalCount: count.length && count[0].count,
      transactions
    }
  }

  getAddressTransactionCount(addresses) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses]
    }
    return Transaction.count({
      $or: [
        {inputAddresses: {$elemMatch: AddressService._constructAddressElementQuery(addresses)}},
        {outputAddresses: {$elemMatch: AddressService._constructAddressElementQuery(addresses)}},
        {
          'receipts.logs': {
            $elemMatch: {
              'topics.0': {$in: [TOKEN_EVENTS.Transfer, TOKEN_EVENTS.Mint, TOKEN_EVENTS.Burn]},
              topics: {$in: AddressService._toHexAddresses(addresses)}
            }
          }
        }
      ]
    })
  }

  async getAddressSummary(addresses, options = {}) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses]
    }
    let totalCount = await this.getAddressTransactionCount(addresses)
    let [result] = await TransactionOutput.aggregate([
      {
        $match: {
          ...AddressService._constructAddressQuery(addresses),
          'output.height': {$gt: 0}
        }
      },
      {
        $group: {
          _id: null,
          totalReceived: {$sum: {$add: ['$satoshis', mongoose.Types.Decimal128.fromString('0')]}},
          totalSent: {
            $sum: {
              $cond: {
                if: {$eq: [{$ifNull: ['$input', null]}, null]},
                then: mongoose.Types.Decimal128.fromString('0'),
                else: {$add: ['$satoshis', mongoose.Types.Decimal128.fromString('0')]}
              }
            }
          },
          unconfirmed: {
            $sum: {
              $cond: {
                if: {$eq: ['$output.height', 0xffffffff]},
                then: '$satoshis',
                else: mongoose.Types.Long(0)
              }
            }
          },
          staking: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    {$eq: ['$isStake', true]},
                    {$gt: ['$output.height', this.node.getBlockTip().height - 500]}
                  ]
                },
                then: '$satoshis',
                else: mongoose.Types.Long(0)
              }
            }
          },
          mature: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    {$in: ['$address.type', ['pubkey', 'pubkeyhash']]},
                    {$eq: [{$ifNull: ['$input', null]}, null]},
                    {$lte: ['$output.height', this.node.getBlockTip().height - 500]}
                  ]
                },
                then: '$satoshis',
                else: mongoose.Types.Long(0)
              }
            }
          }
        }
      }
    ])
    if (!result) {
      return {
        balance: '0',
        totalReceived: '0',
        totalSent: '0',
        unconfirmed: '0',
        staking: '0',
        mature: '0',
        blocksMined: 0,
        totalCount
      }
    }
    let blocksMined = await this.getBlocksMined(addresses)
    let totalReceived = result.totalReceived.toString()
    let totalSent = result.totalSent.toString()
    let unconfirmed = result.unconfirmed.toString()
    let staking = result.staking.toString()
    let mature = result.mature.toString()
    let balance = (new BN(totalReceived)).sub(new BN(totalSent)).toString()
    return {
      balance,
      totalReceived,
      totalSent,
      unconfirmed,
      staking,
      mature,
      ...(
        addresses.length === 1 && balance !== '0'
          ? {ranking: (await Snapshot.count({balance: {$gt: mongoose.Types.Long.fromString(balance)}})) + 1}
          : {}
      ),
      blocksMined,
      totalCount
    }
  }

  static _constructAddressElementQuery(addresses) {
    return {
      $or: addresses.map(address => {
        if (['pubkey', 'pubkeyhash'].includes(address.type)) {
          return {type: {$in: ['pubkey', 'pubkeyhash']}, hex: address.hex}
        } else {
          return address
        }
      })
    }
  }

  static _constructAddressQuery(addresses, key = 'address') {
    return {
      $or: addresses.map(address => {
        if (['pubkey', 'pubkeyhash'].includes(address.type)) {
          return {[key + '.type']: {$in: ['pubkey', 'pubkeyhash']}, [key + '.hex']: address.hex}
        } else {
          return {[key + '.type']: address.type, [key + '.hex']: address.hex}
        }
      })
    }
  }

  static _constructAddressCond(addresses, key = 'address') {
    return {
      $or: addresses.map(address => {
        if (['pubkey', 'pubkeyhash'].includes(address.type)) {
          return {$and: [
            {$in: [`$${key}.type`, ['pubkey', 'pubkeyhash']]},
            {$eq: [`$${key}.hex`, address.hex]}
          ]}
        } else {
          return {$and: [
            {$eq: [`$${key}.type`, address.type]},
            {$eq: [`$${key}.hex`, address.hex]}
          ]}
        }
      })
    }
  }

  static _toHexAddresses(addresses) {
    return addresses
      .filter(address => ['pubkey', 'pubkeyhash'].includes(address.type))
      .map(address => '0'.repeat(24) + address.hex)
  }

  async getAddressUnspentOutputs(addresses) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses]
    }
    let utxoList = await TransactionOutput.find({
      ...AddressService._constructAddressQuery(addresses),
      'output.height': {$gt: 0},
      input: {$exists: false}
    })
    return utxoList.map(utxo => ({
      address: utxo.address,
      txid: utxo.output.transactionId,
      vout: utxo.output.index,
      scriptPubKey: utxo.output.script.toString('hex'),
      satoshis: utxo.satoshis.toString(),
      isStake: utxo.isStake,
      height: utxo.output.height,
      confirmations: Math.max(this.node.getBlockTip().height - utxo.output.height + 1, 0)
    }))
  }

  getBlocksMined(addresses) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses]
    }
    let minerAddresses = addresses
      .filter(address => ['pubkey', 'pubkeyhash'].includes(address.type))
      .map(address => address.hex)
    return Block.count({height: {$gt: 5000}, 'minedBy.hex': {$in: minerAddresses}})
  }

  snapshot({height, minBalance = 1, sort = true, hexOnly, limit} = {}) {
    if (height == null) {
      height = this.node.getBlockTip().height
    }
    return [
      {
        $match: {
          satoshis: {$ne: 0},
          address: {$exists: true},
          'address.type': {$ne: 'contract'},
          'output.height': {$gt: 0, $lte: height},
          $or: [
            {input: {$exists: false}},
            {'input.height': {$gt: height}}
          ]
        }
      },
      ...([hexOnly
        ? {$group: {_id: '$address.hex', balance: {$sum: '$satoshis'}}}
        : {
          $group: {
            _id: {
              type: {
                $cond: {
                  if: {$in: ['$address.type', ['pubkey', 'pubkeyhash']]},
                  then: 'pubkeyhash',
                  else: '$address.type'
                }
              },
              hex: '$address.hex'
            },
            balance: {$sum: '$satoshis'}
          }
        }
      ]),
      {$match: {balance: {$gte: minBalance}}},
      ...(sort ? [{$sort: {balance: -1}}] : []),
      ...(limit == null ? [] : [{$limit: limit}]),
      {$project: {_id: false, address: '$_id', balance: '$balance'}}
    ]
  }

  async cronSnapshot() {
    await TransactionOutput.aggregate(
      this.snapshot({sort: false}).concat({$out: 'snapshots'})
    ).option({allowDiskUse: true})
  }

  async getRichList({from = 0, to = 100} = {}) {
    let totalCount = await Snapshot.count()
    let list = await Snapshot.find({}, {_id: false}).sort({balance: -1}).skip(from).limit(to - from)
    return {totalCount, list}
  }

  async getMiners({from = 0, to = 100} = {}) {
    let [{count, list}] = await Block.aggregate([
      {$match: {height: {$gt: 5000}}},
      {$group: {_id: '$minedBy.hex', blocks: {$sum: 1}}},
      {$project: {_id: false, address: {type: 'pubkey', hex: '$_id'}, blocks: '$blocks'}},
      {
        $facet: {
          count: [{$group: {_id: null, count: {$sum: 1}}}],
          list: [
            {$sort: {blocks: -1}},
            {$skip: from},
            {$limit: to - from},
            {
              $lookup: {
                from: 'snapshots',
                localField: 'address.hex',
                foreignField: 'address.hex',
                as: 'balance'
              }
            },
            {
              $project: {
                address: '$address',
                blocks: '$blocks',
                balance: {
                  $cond: {
                    if: {$eq: ['$balance', []]},
                    then: mongoose.Types.Long(0),
                    else: {$arrayElemAt: ['$balance.balance', 0]}
                  }
                }
              }
            }
          ]
        }
      }
    ])
    return {totalCount: count[0].count, list}
  }

  start() {
    new CronJob({
      cronTime: '0 */10 * * * *',
      onTick: this.cronSnapshot.bind(this),
      start: true
    })
  }
}

module.exports = AddressService
