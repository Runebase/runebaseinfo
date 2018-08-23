const Block = require('runebaseinfo-node/lib/models/block')
const {ErrorResponse} = require('../components/utils')

class StatsController {
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

  async dailyTransactions(ctx) {
    try {
      let list = await Block.aggregate([
        {
          $group: {
            _id: {
              $floor: {$divide: ['$timestamp', 86400]}
            },
            count: {$sum: '$transactionCount'}
          }
        },
        {$project: {_id: false, timestamp: '$_id', count: '$count'}},
        {$sort: {timestamp: 1}}
      ])
      let result = []
      for (let {timestamp, count} of list) {
        let time = new Date(timestamp * 86400 * 1000)
        let year = time.getUTCFullYear()
        let month = time.getUTCMonth() + 1
        let date = time.getUTCDate()
        if (month < 10) {
          month = '0' + month
        }
        if (date < 10) {
          date = '0' + date
        }
        result.push({date: `${year}-${month}-${date}`, time, transactions: count})
      }
      ctx.body = result
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async coinStake(ctx) {
    let splitPoints = []
    for (let i = 0; i <= 35; ++i) {
      splitPoints.push(10 ** (i / 5 - 1))
    }
    let facets = {}
    for (let i = 0; i < splitPoints.length; ++i) {
      facets[i] = [
        {
          $group: {
            _id: null,
            count: {
              $sum: {
                $cond: {
                  if: {$lt: ['$coinStakeSatoshis', splitPoints[i] * 1e8]},
                  then: 1,
                  else: 0
                }
              }
            }
          }
        },
        {$project: {_id: false, count: '$count'}}
      ]
    }
    try {
      let [queryResult] = await Block.aggregate([
        {$match: {height: {$gt: 5000}}},
        {$facet: facets}
      ])
      let list = [{maximum: 0, count: 0}]
      for (let i = 0; i < splitPoints.length; ++i) {
        list.push({maximum: splitPoints[i], count: queryResult[i][0].count})
      }
      list.push({maximum: Infinity, count: this.node.getBlockTip().height - 5000})
      let result = []
      for (let i = 1; i < list.length; ++i) {
        result[i] = {
          minimum: list[i - 1].maximum,
          maximum: list[i].maximum,
          count: list[i].count - list[i - 1].count
        }
      }
      result.shift()
      ctx.body = result
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }
}

module.exports = StatsController
