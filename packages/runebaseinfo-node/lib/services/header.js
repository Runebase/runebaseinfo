const assert = require('assert')
const {BN} = require('runebaseinfo-lib').crypto
const BaseService = require('../service')
const Header = require('../models/header')
const {
  RUNEBASE_GENESIS_HASH, RUNEBASE_GENESIS_TIMESTAMP, RUNEBASE_GENESIS_BITS, RUNEBASE_GENESIS_MERKLE_ROOT, RUNEBASE_GENESIS_NONCE,
  RUNEBASE_GENESIS_HASH_STATE_ROOT, RUNEBASE_GENESIS_HASH_UTXO_ROOT
} = require('../constants')
const {fromCompact, getTarget, double256, getDifficulty, AsyncQueue} = require('../utils')

const MAX_CHAINWORK = new BN(1).ushln(256)
const STARTING_CHAINWORK = '0'.repeat(56) + '0001'.repeat(2)

class HeaderService extends BaseService {
  constructor(options) {
    super(options)
    this._tip = null
    this._p2p = this.node.services.get('p2p')
    this._hashes = []
    this._subscriptions = {block: []}
    this._checkpoint = options.checkpoint || 2000
    this._network = this.node.network
    if (this._network === 'livenet') {
      this._network = 'mainnet'
    } else if (this._network === 'regtest') {
      this._network = 'testnet'
    }
    this.GENESIS_HASH = RUNEBASE_GENESIS_HASH[this._network]
    this.GENESIS_TIMESTAMP = RUNEBASE_GENESIS_TIMESTAMP
    this.GENESIS_BITS = RUNEBASE_GENESIS_BITS
    this.GENESIS_MERKLE_ROOT = RUNEBASE_GENESIS_MERKLE_ROOT
    this.GENESIS_NONCE = RUNEBASE_GENESIS_NONCE[this._network]
    this.GENESIS_HASH_STATE_ROOT = RUNEBASE_GENESIS_HASH_STATE_ROOT
    this.GENESIS_HASH_UTXO_ROOT = RUNEBASE_GENESIS_HASH_UTXO_ROOT
    this._lastHeader = null
    this._initialSync = true
    this._originalHeight = 0
    this._lastHeaderCount = 2000
    this._slowMode = options.slowMode
  }

  static get dependencies() {
    return ['db', 'p2p']
  }

  get APIMethods() {
    return {
      getBestHeight: this.getBestHeight.bind(this),
      getBlockHeader: this.getBlockHeader.bind(this)
    }
  }

  getCurrentDifficulty() {
    return getDifficulty(getTarget(this._lastHeader.bits))
  }

  getBlockHeader(arg) {
    if (Number.isInteger(arg)) {
      return this._getHeader(arg, null)
    } else {
      return this._getHeader(null, arg)
    }
  }

  getBestHeight() {
    return this._tip.height
  }

  _adjustTipBackToCheckpoint() {
    this._originalHeight = this._tip.height
    if (this._checkpoint === -1 || this._tip.height < this._checkpoint) {
      this._tip.height = 0
      this._tip.hash = this.GENESIS_HASH
    } else {
      this._tip.height -= this._checkpoint
    }
  }

  async _setGenesisBlock() {
    assert(this._tip.hash === this.GENESIS_HASH, 'Expected tip hash to be genesis hash, but it was not.')
    await Header.remove()
    let genesisBlock = new Header({
      hash: this.GENESIS_HASH,
      height: 0,
      version: 1,
      merkleRoot: this.GENESIS_MERKLE_ROOT,
      timestamp: this.GENESIS_TIMESTAMP,
      bits: this.GENESIS_BITS,
      nonce: this.GENESIS_NONCE,
      hashStateRoot: this.GENESIS_HASH_STATE_ROOT,
      hashUTXORoot: this.GENESIS_HASH_UTXO_ROOT,
      prevOutStakeN: 0xffffffff,
      vchBlockSig: '',
      chainwork: STARTING_CHAINWORK,
    })
    this._lastHeader = genesisBlock
    await genesisBlock.save()
  }

  async start() {
    this._tip = await this.node.getServiceTip(this.name)
    this._adjustTipBackToCheckpoint()
    if (this._tip.height === 0) {
      await this._setGenesisBlock()
    }
    await this._adjustHeadersForCheckPointTip()
    this._blockProcessor = new AsyncQueue(this._processBlocks.bind(this))
    this._setListeners()
    this._bus = this.node.openBus({remoteAddress: 'localhost-header'})
  }

  _startHeaderSubscription() {
    if (this._subscribedHeaders) {
      return
    }
    this._subscribedHeaders = true
    this.node.log.info('Header Service: subscribed to p2p headers.')
    this._bus.on('p2p/headers', this._onHeaders.bind(this))
    this._bus.subscribe('p2p/headers')
  }

  _queueBlock(block) {
    this._blockProcessor.push(block, err => {
      if (err) {
        this._handleError(err)
      } else {
        this.node.log.debug(
          `Header Service: completed processing block: ${block.hash},`,
          'prev hash:', Buffer.from(block.header.prevHash).reverse().toString('hex')
        )
      }
    })
  }

  async _processBlocks(block) {
    if (this.node.stopping || this._reorging) {
      return
    }
    try {
      let header = await this.getBlockHeader(block.hash)
      if (header) {
        this.node.log.debug('Header Service: block already exists in data set.')
      } else {
        await this._persistHeader(block)
      }
    } catch (err) {
      this._handleError(err)
    }
  }

  async _persistHeader(block) {
    if (!this._detectReorg(block)) {
      return await this._syncBlock(block)
    }
    this._reorging = true
    this.emit('reorg')
    await this._handleReorg(block)
    this._startSync()
  }

  async _syncBlock(block) {
    this.node.log.debug('Header Service: new block:', block.hash)
    let header = new Header({hash: block.hash, ...block.header.toObject()})
    this._onHeader(header)
    await header.save()
    await this.node.updateServiceTip(this.name, this._tip)
  }

  _broadcast(block) {
    for (let emitter of this.subscriptions.block) {
      emitter.emit('header/block', block)
    }
  }

  _onHeader(header) {
    header.height = this._lastHeader.height + 1
    header.chainwork = this._getChainwork(header, this._lastHeader).toString(16, 64)
    this._lastHeader = header
    this._tip.height = header.height
    this._tip.hash = header.hash
  }

  _transformHeaders(headers) {
    let result = []
    for (let i = 0; i < headers.length; ++i) {
      let header = headers[i].toObject()
      result.push(new Header({hash: header.hash, ...header}))
    }
    return result
  }

  async _onHeaders(headers) {
    if (headers.length === 0) {
      this._onHeadersSave().catch(err => this._handleError(err))
    }
    this._lastHeaderCount = headers.length
    this.node.log.debug('Header Service: Received:', headers.length, 'header(s).')
    let transformedHeaders = this._transformHeaders(headers)
    for (let header of transformedHeaders) {
      assert(
        this._lastHeader.hash === header.prevHash,
        `headers not in order: ${this._lastHeader.hash} -and- ${header.prevHash}, `
          + `Last header at height: ${this._lastHeader.height}`
      )
      this._onHeader(header)
    }
    await Header.insertMany(transformedHeaders)
    await this.node.updateServiceTip(this.name, this._tip)
    await this._onHeadersSave()
  }

  _handleError(err) {
    this.node.log.error('Header Service:', err)
    this.node.stop()
  }

  async _onHeadersSave() {
    this._logProgress()
    if (!this._syncComplete()) {
      this._sync()
      return
    }
    this._endHeaderSubscription()
    this._startBlockSubscription()
    this._setBestHeader()
    if (!this._initialSync) {
      return
    }
    this.node.log.info('Header Service: sync complete.')
    this._initialSync = false
    for (let service of this.node.getServicesByOrder()) {
      if (service.onHeaders) {
        await service.onHeaders()
      }
    }
    this.emit('reorg complete')
    this._reorging = false
  }

  _endHeaderSubscription() {
    if (this._subscribedHeaders) {
      this._subscribedHeaders = false
      this.node.log.info('Header Service: p2p header subscription no longer needed, unsubscribing.')
      this._bus.unsubscribe('p2p/headers')
    }
  }

  _startBlockSubscription() {
    if (this._subscribedBlock) {
      return
    }
    this._subscribedBlock = true
    this.node.log.info('Header Service: starting p2p block subscription.')
    this._bus.on('p2p/block', this._queueBlock.bind(this))
    this._bus.subscribe('p2p/block')
  }

  _syncComplete() {
    return this._lastHeaderCount < 2000
  }

  _setBestHeader() {
    this.node.log.debug('Header Service:', this._lastHeader.hash, 'is the best bock hash.')
  }

  _getHeader(height, hash) {
    assert(hash || height >= 0, 'invalid arguments')
    if (this._lastHeader.height === height || this._lastHeader.hash === hash) {
      return this._lastHeader
    }
    return Header.findOne({$or: [{height}, {hash}]})
  }

  _detectReorg(block) {
    return Buffer.from(block.prevBlock, 'hex').reverse().toString('hex') !== this._lastHeader.hash
  }

  async _handleReorg(block) {
    this.node.log.warn(
      `Header Service: Reorganization detected, current tip hash: ${this._tip.hash},`,
      'new block causing the reorg:', block.hash
    )
    this._adjustTipBackToCheckpoint()
    await this._adjustHeadersForCheckPointTip()
  }

  _setListeners() {
    this._p2p.on('bestHeight', this._onBestHeight.bind(this))
  }

  _onBestHeight(height) {
    this.node.log.info('Header Service: Best Height is:', height)
    this._bestHeight = height
    this._startSync()
  }

  _startSync() {
    this._initialSync = true
    this.node.log.debug(
      'Header Service: starting sync routines, ensuring no pre-exiting subscriptions to p2p blocks.'
    )
    this._removeAllSubscriptions()
    let interval = setInterval(() => {
      if (this._blockProcessor.length === 0) {
        clearInterval(interval)
        this._reorging = true
        let numNeeded = Math.max(this._bestHeight, this._originalHeight) - this._tip.height
        if (numNeeded > 0) {
          this.node.log.info('Header Service: Gathering:', numNeeded, 'header(s) from the peer-to-peer network.')
          this._sync()
        } else if (numNeeded === 0) {
          this.node.log.info('Header Service: we seem to be already synced with the peer.')
          this._onHeadersSave().catch(err => this._handleError(err))
        } else {
          this._handleLowTipHeight()
        }
      }
    }, 0)
  }

  _removeAllSubscriptions() {
    this._bus.unsubscribe('p2p/headers')
    this._bus.unsubscribe('p2p/block')
    this._subscribedBlock = false
    this._subscribedHeaders = false
    this._bus.removeAllListeners()
  }

  async _findReorgConditionInNewPeer() {
    let newPeerHeaders = []
    let allHeaders = await this.getAllHeaders()
    this.node.log.warn('Header Service: re-subscribing to p2p headers to gather new peer\'s headers.')
    this._getP2PHeaders(this.GENESIS_HASH)

    return new Promise((resolve, reject) => {
      this._bus.subscribe('p2p/headers')
      this._bus.on('p2p/headers', headers => {
        for (let header of headers) {
          newPeerHeaders.push([header.hash, header])
        }
        if (newPeerHeaders.length < this._bestHeight) {
          return this._getP2PHeaders(headers[headers.length - 1].hash)
        }
        let reorgInfo = {commonHeader: null, blockHash: null}
        for (let i = newPeerHeaders.length; --i >= 0;) {
          let newHeader = newPeerHeaders[i]
          let oldHeader = allHeaders.get(newHeader.hash)
          if (oldHeader) {
            if (!reorgInfo.blockHash) {
              resolve()
            }
            reorgInfo.commonHeader = oldHeader
            resolve(reorgInfo)
          }
          reorgInfo.blockHash = newHeader.hash
        }
      })
    })
  }

  async _handleLowTipHeight() {
    this.node.log.warn(
      'Header Service: Connected Peer has a best height',
      `(${this._bestHeight})`,
      'which is lower than our tip height',
      `(${this._tip.height}).`,
      'This means that this peer is not fully synchronized with the network',
      '-or- the peer has reorganized itself.',
      'Checking the new peer\'s headers for a reorganization event.'
    )
    try {
      let reorgInfo = await this._findReorgConditionInNewPeer()
      if (!reorgInfo) {
        this.node.log.info(
          'Header Service: it appears that our peer is not yet synchronized with the network',
          '(we have a strict superset of the peer\'s blocks).',
          'We will wait for more blocks to arrive...'
        )
        await this._onHeadersSave()
      } else {
        let block = await this.node.getP2PBlock({
          filter: {startHash: reorgInfo.commonHeader.hash, endHash: 0},
          blockHash: reorgInfo.blockHash
        })
        this._initialSync = true
        await this._handleReorg(block, reorgInfo.commonHeader)
        this._startSync()
      }
    } catch (err) {
      this._handleError(err)
    }
  }

  _logProgress() {
    if (!this._initialSync || this._lastTipHeightReported === this._tip.height) {
      return
    }
    let progress
    let bestHeight = Math.max(this._bestHeight, this._lastHeader.height)
    if (bestHeight === 0) {
      progress = 0
    } else {
      progress = (this._tip.height / bestHeight * 100).toFixed(2)
    }
    this.node.log.info(
      'Header Service: download progress:',
      this._tip.height + '/' + bestHeight,
      '(' + progress + '%)'
    )
    this._lastTipHeightReported = this._tip.height
  }

  _getP2PHeaders(hash) {
    this.node.getHeaders({startHash: hash})
  }

  _sync() {
    this._startHeaderSubscription()
    this._getP2PHeaders(this._tip.hash)
  }

  async getEndHash(tip, blockCount) {
    assert(blockCount >= 1, 'Header Service: block count to getEndHash must be at least 1.')
    let numResultsNeeded = Math.min(this._tip.height - tip.height, blockCount + 1)
    if (numResultsNeeded === 0 && this._tip.hash === tip.hash) {
      return
    } else if (numResultsNeeded <= 0) {
      throw new Error('Header Service: block service is mis-aligned')
    }
    let startingHeight = tip.height + 1
    let results = (await Header.find(
      {height: {$gte: startingHeight, $lte: startingHeight + blockCount}},
      'hash'
    )).map(header => header.hash)
    assert(results.length === numResultsNeeded, 'getEndHash returned incorrect number of results.')
    let index = numResultsNeeded - 1
    let endHash = index <= 0 || !results[index] ? 0 : results[index]
    if (this._slowMode) {
      return new Promise(resolve =>
        setTimeout(() => resolve({targetHash: results[0], endHash}))
      )
    } else {
      return {targetHash: results[0], endHash}
    }
  }

  getLastHeader() {
    assert(this._lastHeader, 'Last header should be populated.')
    return this._lastHeader
  }

  async _adjustHeadersForCheckPointTip() {
    this.node.log.info('Getting last header synced at height:', this._tip.height)
    await Header.remove({height: {$gt: this._tip.height}})
    this._lastHeader = await Header.findOne({height: this._tip.height})
    this._tip.hash = this._lastHeader.hash
    this._tip.height = this._lastHeader.height
  }

  _getChainwork(header, prevHeader) {
    let prevChainwork = new BN(Buffer.from(prevHeader.chainwork, 'hex'))
    return this._computeChainwork(header.bits, prevChainwork)
  }

  _computeChainwork(bits, prev) {
    let target = fromCompact(bits)
    if (target.isNeg() || target.cmpn(0) === 0) {
      return new BN(0)
    }
    let proof = MAX_CHAINWORK.div(target.iaddn(1))
    return prev ? proof.iadd(prev) : proof
  }
}

module.exports = HeaderService
