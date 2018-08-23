const assert = require('assert')
const {promisify} = require('util')
const LRU = require('lru-cache')
const {Networks, Transaction} = require('runebaseinfo-lib')
const {Inventory, Messages, Pool} = require('runebaseinfo-p2p')
const BaseService = require('../service')

class P2P extends BaseService {
  constructor(options) {
    super(options)
    this._options = options
    this._initP2P()
    this._initPubSub()
    this._currentBestHeight = null
    this._outgoingTxs = LRU(100)
    this._blockCache = options.blockCacheCount || LRU({
      max: 10,
      maxAge: 5 * 60 * 1000
    })
  }

  clearInventoryCache() {
    this._inv.reset()
  }

  get APIMethods() {
    return {
      clearInventoryCache: this.clearInventoryCache.bind(this),
      getP2PBlock: this.getP2PBlock.bind(this),
      getHeaders: this.getHeaders.bind(this),
      getMempool: this.getMempool.bind(this),
      getNumberOfPeers: this.getNumberOfPeers.bind(this),
      sendTransaction: this.sendTransaction.bind(this)
    }
  }

  getNumberOfPeers() {
    return this._pool.numberConnected
  }

  async getP2PBlock({blockHash, filter}) {
    let block = this._blockCache.get(blockHash)
    if (block) {
      return block
    }

    let blockFilter = this._setResourceFilter(filter, 'blocks')
    this._peer.sendMessage(this.messages.GetBlocks(blockFilter))

    return new Promise((resolve, reject) => {
      let timeout
      let callback = block => {
        clearTimeout(timeout)
        resolve(block)
      }
      timeout = setTimeout(() => {
        this.removeListener(blockHash, callback)
        reject()
      }, 5000)
      this.once(blockHash, callback)
    })
  }

  getHeaders(filter) {
    let headerFilter = this._setResourceFilter(filter, 'headers')
    this._peer.sendMessage(this.messages.GetHeaders(headerFilter))
  }

  getMempool() {
    this._peer.sendMessage(this.messages.Mempool())
  }

  async sendTransaction(tx) {
    let transaction = new Transaction().fromBuffer(tx, 'hex')
    let id = transaction.id
    this.node.log.info('P2P Service: sending transcation:', id)
    this._outgoingTxs.set(id, transaction)
    let inv = Inventory.forTransaction(id)
    let txMessage = this.messages.Inventory([inv])
    this._peer.sendMessage(txMessage)
    this._onPeerTx(this._peer, {transaction})
    return id
  }

  async start() {
    this._initCache()
    this._initPool()
    this._setListeners()
  }

  _disconnectPool() {
    this.node.log.info('P2P Service: disconnecting pool and peers. SIGINT issued, system shutdown initiated')
    this._pool.disconnect()
  }

  _addPeer(peer) {
    this._peers.push(peer)
  }

  _applyMempoolFilter(message) {
    if (!this._mempoolFilter) {
      return message
    }

    let txIndex = this._mempoolFilter.indexOf(message.transaction.hash)
    if (txIndex >= 0) {
      this._mempoolFilter.splice(txIndex, 1)
    } else {
      return message
    }
  }

  _broadcast(subscribers, name, entity) {
    for (let emitter of subscribers) {
      emitter.emit(name, entity)
    }
  }

  _setRetryInterval() {
    if (!this._retryInterval && !this.node.stopping) {
      this._retryInterval = setInterval(() => {
        this.node.log.info('Retrying connection to p2p network.')
        this._pool.connect()
      }, 5000)
    }
  }

  _connect() {
    this.node.log.info('Connecting to p2p network.')
    this._pool.connect()
    this._setRetryInterval()
  }

  _getBestHeight() {
    if (this._peers.length === 0) {
      return 0
    }

    let maxHeight = -1
    for (let peer of this._peers) {
      if (peer.bestHeight > maxHeight) {
        maxHeight = peer.bestHeight
        this._peer = peer
      }
    }

    return maxHeight
  }

  _initCache() {
    this._inv = LRU(1000)
  }

  _initP2P() {
    this._maxPeers = this._options.maxPeers || 60
    this._minPeers = this._options.minPeers || 0
    this._configPeers = this._options.peers

    if (this.node.network === 'regtest') {
      Networks.enableRegtest()
    }

    this.messages = new Messages({
      network: Networks.get(this.node.network),
      Transaction
    })
    this._peerHeights = []
    this._peers = []
    this._peerIndex = 0
    this._mempoolFilter = []
  }

  _initPool() {
    let options = {
      dnsSeed: false,
      listenAddr: false,
      maxPeers: this._maxPeers,
      network: this.node.network
    }
    if (this._configPeers) {
      options.addrs = this._configPeers
    }
    Pool.RetrySeconds = 3
    this._pool = new Pool(options)
  }

  _initPubSub() {
    this._subscriptions = {
      block: [],
      headers: [],
      transaction: []
    }
  }

  _onPeerBlock(peer, message) {
    this._blockCache.set(message.block.hash, message.block)
    this.emit(message.block.hash, message.block)
    this._broadcast(this._subscriptions.block, 'p2p/block', message.block)
  }

  _onPeerDisconnect(peer, addr) {
    this._removePeer(peer)
    if (this._peers.length === 0) {
      this._setRetryInterval()
    }
    this.node.log.info('Disconnected from peer:', addr.ip.v4)
  }

  _onPeerGetData(peer, message) {
    let txId = message.inventory[0].hash.reverse().toString('hex')
    let tx = this._outgoingTxs.get(txId)
    if (tx) {
      peer.sendMessage(this.messages.Transaction(tx, {Transaction}))
    }
  }

  _onPeerHeaders(peer, message) {
    this._broadcast(this._subscriptions.headers, 'p2p/headers', message.headers)
  }

  _onPeerInventory(peer, message) {
    let newDataNeeded = []
    for (let inv of message.inventory) {
      if (!this._inv.get(inv.hash)) {
        this._inv.set(inv.hash, true)
        if ([Inventory.TYPE.TX, Inventory.TYPE.BLOCK, Inventory.TYPE.FILTERED_BLOCK].includes(inv.type)) {
          inv.type |= 0x40000000
        }
        newDataNeeded.push(inv)
      }
    }
    if (newDataNeeded.length > 0) {
      peer.sendMessage(this.messages.GetData(newDataNeeded))
    }
  }

  _matchNetwork(network) {
    if (this.node.network === network.name || this.node.network === network.alias) {
      return this.node.network === network.name ? network.name : network.alias
    }
    this.node.log.error(
      'Configured network: "' + this.node.network
      + '" does not match our peer\'s reported network: "' + network.name + '".'
    )
    this.node.stop()
  }

  _onPeerReady(peer, addr) {
    if (this._retryInterval) {
      clearInterval(this._retryInterval)
      this._retryInterval = null
    }

    let network = this._matchNetwork(peer.network)
    if (!network) {
      return
    }

    this.node.log.info([
      `Connected to peer: ${addr.ip.v4}`,
      `network: ${network}`,
      `version: ${peer.version}`,
      `subversion: ${peer.subversion}`,
      `status: ${peer.status}`,
      `port: ${peer.port}`,
      `best height: ${peer.bestHeight}`
    ].join(', '))

    this._addPeer(peer)
    let bestHeight = this._getBestHeight()
    if (bestHeight >= 0) {
      this.emit('bestHeight', bestHeight)
    }
  }

  _onPeerTx(peer, message) {
    this._broadcast(this._subscriptions.transaction, 'p2p/transaction', message.transaction)
  }

  _removePeer(peer) {
    this._peers.splice(this._peers.indexOf(peer), 1)
  }

  _setListeners() {
    this.node.on('stopping', this._disconnectPool.bind(this))
    this._pool.on('peerready', this._onPeerReady.bind(this))
    this._pool.on('peerdisconnect', this._onPeerDisconnect.bind(this))
    this._pool.on('peerinv', this._onPeerInventory.bind(this))
    this._pool.on('peertx', this._onPeerTx.bind(this))
    this._pool.on('peerblock', this._onPeerBlock.bind(this))
    this._pool.on('peerheaders', this._onPeerHeaders.bind(this))
    this._pool.on('peergetdata', this._onPeerGetData.bind(this))
    this.node.on('ready', this._connect.bind(this))
  }

  _setResourceFilter(filter) {
    assert(filter && filter.startHash, 'A "starthash" field is required to retrieve headers or blocks')
    return {starts: [filter.startHash], stop: filter.endHash || 0}
  }
}

module.exports = P2P
