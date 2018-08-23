const WebSocket = require('ws')
const {BN} = require('runebaseinfo-lib').crypto
const BaseService = require('runebaseinfo-node/lib/service')
const Block = require('runebaseinfo-node/lib/models/block')

class RunebaseinfoWS extends BaseService {
  constructor(options) {
    super(options)
    this._options = options
  }

  static get dependencies() {
    return ['block', 'contract', 'header', 'mempool', 'transaction', 'web']
  }

  get routePrefix() {
    return this._routePrefix
  }

  async start() {
    if (this._subscribed) {
      return
    }
    this._subscribed = true
    if (!this._bus) {
      this._bus = this.node.openBus({remoteAddress: 'localhost-runebaseinfo-ws'})
    }
    this._bus.on('mempool/transaction', this.mempoolTransactionEventHandler.bind(this))
    this._bus.subscribe('mempool/transaction')
    this._bus.on('block/block', this.blockEventHandler.bind(this))
    this._bus.subscribe('block/block')
    this._bus.on('block/transaction', this.transactionEventHandler.bind(this))
    this._bus.subscribe('block/transaction')
    this._bus.on('block/address', this.addressEventHandler.bind(this))
    this._bus.subscribe('block/address')

    this._server = new WebSocket.Server({port: this._options.port})
    this._server.on('connection', (ws, req) => {
      ws.subscriptions = new Set(['height'])
      ws.send(JSON.stringify({type: 'height', data: this.node.getBlockTip().height}))
      ws.on('message', message => {
        if (message === '"ping"') {
          ws.send(JSON.stringify('pong'))
        } else {
          try {
            message = JSON.parse(message)
            if (message.type === 'subscribe') {
              ws.subscriptions.add(message.data)
            } else if (message.type === 'unsubscribe') {
              ws.subscriptions.delete(message.data)
            }
          } catch (err) {}
        }
      })
      ws.on('close', (code, reason) => {})
      ws.on('error', () => {})
    })
  }

  stop() {
    this._server.close()
  }

  getRemoteAddress(req) {
    return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress
  }

  mempoolTransactionEventHandler(transaction) {
    for (let client of this._server.clients) {
      if (client.subscriptions.has('mempool/transaction')) {
        client.send(JSON.stringify({
          type: 'mempool/transaction',
          data: transaction
        }))
      }
    }
  }

  async blockEventHandler(block) {
    let transformedBlock = await this.transformBlock(block)
    for (let client of this._server.clients) {
      if (client.subscriptions.has('height')) {
        client.send(JSON.stringify({
          type: 'height',
          data: block.height
        }))
      }
      if (client.subscriptions.has('block')) {
        client.send(JSON.stringify({
          type: 'block',
          data: transformedBlock
        }))
      }
    }
  }

  transactionEventHandler(transaction) {
    for (let client of this._server.clients) {
      if (client.subscriptions.has('transaction/' + transaction.id)) {
        client.send(JSON.stringify({
          type: 'transaction/' + transaction.id,
          data: transaction
        }))
      }
    }
  }

  addressEventHandler(address) {
    for (let client of this._server.clients) {
      if (client.subscriptions.has('address')) {
        client.send(JSON.stringify({
          type: 'address',
          data: address
        }))
      }
    }
  }

  async transformBlock(block) {
    let {reward, minedBy, duration} = await this.getBlockReward(block)
    return {
      hash: block.hash,
      size: block.size,
      weight: block.weight,
      height: block.height,
      version: block.version,
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
      minedBy,
      duration,
      isMainChain: true
    }
  }

  async getBlockReward(block) {
    let minedBy, duration
    let reward = 0
    if (block.prevOutStakeHash !== '0'.repeat(64) && block.prevOutStakeN !== 0xffffffff) {
      let transaction = await this.node.getTransaction(block.transactions[1])
      reward = -transaction.feeSatoshis
      minedBy = transaction.outputs[1].address
    } else {
      let transaction = await this.node.getTransaction(block.transactions[0])
      reward = transaction.outputSatoshis
      minedBy = transaction.outputs[0].address
    }
    let prevHash = block.prevHash
    if (prevHash !== '0'.repeat(64)) {
      let prevBlockHeader = await this.node.getBlockHeader(prevHash)
      duration = block.timestamp - prevBlockHeader.timestamp
    }
    return {reward, minedBy, duration}
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

module.exports = RunebaseinfoWS
