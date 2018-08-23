const {BN} = require('runebaseinfo-lib').crypto
const Block = require('runebaseinfo-node/lib/models/block')
const {toRawBlock} = require('runebaseinfo-node/lib/utils')
const {ErrorResponse} = require('../components/utils')

const DEFAULT_BLOCK_CACHE_SIZE = 1000
const BLOCK_CACHE_CONFIRMATIONS = 6

function formatTimestamp(date) {
  let yyyy = date.getUTCFullYear().toString()
  let mm = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  let dd = date.getUTCDate().toString().padStart(2, '0')
  return yyyy + '-' + mm + '-' + dd
}

class BlocksController {
  constructor({
    node,
    blockCacheSize = DEFAULT_BLOCK_CACHE_SIZE
  }) {
    this.node = node
    this.errorResponse = new ErrorResponse({log: this.node.log})
    this._network = this.node.network
    if (this.node.network === 'livenet') {
      this._network = 'mainnet'
    } else if (this.node.network === 'regtest') {
      this._network = 'testnet'
    }
  }

  async block(ctx, next) {
    let block = ctx.params.block
    if (/^(0|[1-9]\d{0,9})$/.test(block)) {
      block = Number(block)
    }
    block = await this.node.getBlock(block)
    if (block) {
      ctx.block = await this.transformBlock(block)
      return await next()
    } else {
      ctx.throw(404)
    }
  }

  async rawBlock(ctx, next) {
    let hash = ctx.params.blockHash
    if (/^[0-9A-Fa-f]{64}$/.test(hash)) {
      let block = await Block.findOne({hash})
      if (block) {
        let blockBuffer = (await toRawBlock(block)).toBuffer()
        ctx.rawBlock = blockBuffer.toString('hex')
        return await next()
      }
    }
    ctx.throw(404)
  }

  async transformBlock(block) {
    let {reward, duration} = await this.getBlockReward(block)
    return {
      hash: block.hash,
      height: block.height,
      version: block.version,
      size: block.size,
      weight: block.weight,
      merkleRoot: block.merkleRoot,
      tx: block.transactions,
      timestamp: block.timestamp,
      nonce: block.nonce,
      bits: block.bits.toString(16),
      difficulty: this._getDifficulty(block.bits),
      chainWork: block.chainwork,
      confirmations: this.node.getBlockTip().height - block.height + 1,
      previousBlockHash: block.prevHash,
      nextBlockHash: block.nextHash,
      reward,
      minedBy: block.minedBy,
      duration,
      isMainChain: true
    }
  }

  async show(ctx) {
    ctx.body = ctx.block
  }

  async showRaw(ctx) {
    ctx.body = ctx.rawBlock
  }

  async _getBlockSummary(block) {
    let {reward, minedBy, duration} = await this.getBlockReward(block)
    let summary = {
      hash: block.hash,
      height: block.height,
      size: block.size,
      timestamp: block.timestamp,
      txLength: block.transactions.length,
      reward,
      minedBy: block.minedBy,
      duration
    }
    return summary
  }

  async recentBlocks(ctx) {
    let count = ctx.query.count || 10
    let height = this.node.getBlockTip().height
    let blocks = await Block.find({height: {$gt: height - 10}}).sort({height: -1})
    ctx.body = await Promise.all(blocks.map(block => this._getBlockSummary(block)))
  }

  async list(ctx) {
    let date = ctx.query.date || formatTimestamp(new Date())
    let gte = Math.floor(Date.parse(date) / 1000)
    let lt = gte + 24 * 60 * 60

    try {
      let blocks = await Block.find({timestamp: {$lt: lt, $gte: gte}}).sort({height: -1})
      blocks = await Promise.all(blocks.map(block => this._getBlockSummary(block)))
      ctx.body = blocks
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async getBlockReward(block) {
    let duration
    let reward = 0
    if (block.prevOutStakeHash !== '0'.repeat(64) && block.prevOutStakeN !== 0xffffffff) {
      let transaction = await this.node.getTransaction(block.transactions[1])
      reward = -transaction.feeSatoshis
    } else {
      let transaction = await this.node.getTransaction(block.transactions[0])
      reward = transaction.outputSatoshis
    }
    let prevHash = block.prevHash
    if (prevHash !== '0'.repeat(64)) {
      let prevBlockHeader = await this.node.getBlockHeader(prevHash)
      duration = block.timestamp - prevBlockHeader.timestamp
    }
    return {reward: reward.toString(), duration}
  }

  _getTargetDifficulty(bits) {
    let target = new BN(bits & 0xffffff)
    let mov = ((bits >>> 24) - 3) << 3
    while (mov--) {
      target = target.mul(new BN(2))
    }
    return target
  }

  _getDifficulty(bits) {
    let difficultyTargetBN = this._getTargetDifficulty(0x1d00ffff).mul(new BN(100000000))
    let currentTargetBN = this._getTargetDifficulty(bits)
    let difficultyString = difficultyTargetBN.div(currentTargetBN).toString(10)
    let decimalPos = difficultyString.length - 8
    difficultyString = difficultyString.slice(0, decimalPos) + '.' + difficultyString.slice(decimalPos)
    return Number.parseFloat(difficultyString)
  }
}

exports = module.exports = BlocksController
exports.DEFAULT_BLOCK_CACHE_SIZE = DEFAULT_BLOCK_CACHE_SIZE
