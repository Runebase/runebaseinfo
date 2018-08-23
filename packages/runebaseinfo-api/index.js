const {Writable} = require('stream')
const Router = require('koa-router')
const morgan = require('koa-morgan')
const cors = require('koa-cors')
const compress = require('koa-compress')
const bodyparser = require('koa-bodyparser')
const BaseService = require('runebaseinfo-node/lib/service')
const AddressController = require('./controllers/addresses')
const BlockController = require('./controllers/blocks')
const ContractController = require('./controllers/contracts')
const MiscController = require('./controllers/misc')
const TransactionController = require('./controllers/transactions')
const StatsController = require('./controllers/statistics')
const SearchController = require('./controllers/search')
const RateLimiter = require('./components/rate-limiter')

class RunebaseinfoAPI extends BaseService {
  constructor(options) {
    super(options)

    this.enableCache = options.enableCache
    this.cacheShortSeconds = options.cacheShortSeconds
    this.cacheLongSeconds = options.cacheLongSeconds

    this.rateLimiterOptions = options.rateLimiterOptions || {}
    this.disableRateLimiter = options.disableRateLimiter

    this.blockCacheSize = options.blockCacheSize || BlockController.DEFAULT_BLOCK_CACHE_SIZE

    if ("routePrefix" in options) {
      this._routePrefix = options.routePrefix
    } else {
      this._routePrefix = this.name
    }

    let blockOptions = {
      node: this.node,
      blockSummaryCache: this.blockSummaryCache,
      blockCacheSize: this.blockCacheSize,
      transactionService: this.transactionService
    }
    this.addressController = new AddressController(this.node)
    this.blockController = new BlockController(blockOptions)
    this.contractController = new ContractController(this.node)
    this.transactionController = new TransactionController(this.node)
    this.miscController = new MiscController(this.node)
    this.statsController = new StatsController(this.node)
    this.searchController = new SearchController(this.node)
  }

  cache(maxAge) {
    return async (ctx, next) => {
      if (this.enableCache) {
        ctx.set('Cache-Control', `public, max-age=${maxAge}`)
      }
      await next()
    }
  }

  cacheShort() {
    return this.cache(this.cacheShortSeconds || 30)
  }

  cacheLong() {
    return this.cache(this.cacheLongSeconds || 24 * 60 * 60)
  }

  static get dependencies() {
    return ['block', 'contract', 'header', 'mempool', 'transaction', 'web']
  }

  get routePrefix() {
    return this._routePrefix
  }

  createLogInfoStream() {
    const that = this
    class Log extends Writable {
      _write(chunk, encoding, callback) {
        that.node.log.info(chunk.slice(0, chunk.length - 1).toString())
        callback()
      }
    }
    return new Log()
  }

  getRemoteAddress(req) {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress
  }

  _getRateLimiter() {
    let rateLimiterOptions = Object.assign({node: this.node}, this.rateLimiterOptions)
    return new RateLimiter(rateLimiterOptions)
  }

  setupRoutes(app) {
    if (!this.disableRateLimiter) {
      let limiter = this._getRateLimiter()
      app.use(limiter.middleware())
    }

    morgan.token('remote-forward-addr', req => this.getRemoteAddress(req))
    let logFormat = ':remote-forward-addr ":method :url" :status :res[content-length] :response-time ":user-agent" '
    let logStream = this.createLogInfoStream()
    app.use(morgan(logFormat, {stream: logStream}))

    app.use(cors())
    app.use(compress())
    app.use(bodyparser())

    app.use(async (ctx, next) => {
      try {
        await next()
      } catch (err) {
        ctx.status = err.status || 500
        app.emit('error', err, ctx)
      }
    })

    let router = new Router()

    let misc = this.miscController
    router.get('/info', misc.info.bind(misc))
    router.get('/supply', misc.supply.bind(misc))
    router.get('/circulating-supply', misc.circulatingSupply.bind(misc))
    router.get('/search/:id', misc.classify.bind(misc))
    router.get('/misc/rich-list', misc.richList.bind(misc))
    router.get('/misc/biggest-miners', misc.biggestMiners.bind(misc))

    let blocks = this.blockController
    router.get('/blocks', this.cacheShort(), blocks.list.bind(blocks))
    router.get(
      '/block/:block',
      this.cacheShort(),
      blocks.block.bind(blocks),
      blocks.show.bind(blocks)
    )
    router.get(
      '/rawblock/:blockHash',
      this.cacheLong(),
      blocks.rawBlock.bind(blocks),
      blocks.showRaw.bind(blocks)
    )
    router.get('/recent-blocks', blocks.recentBlocks.bind(blocks))

    let transactions = this.transactionController
    router.get(
      '/tx/:txid',
      this.cacheShort(),
      transactions.transaction.bind(transactions),
      transactions.show.bind(transactions)
    )
    router.get(
      '/txs/:txids',
      this.cacheShort(),
      transactions.transactions.bind(transactions),
      transactions.show.bind(transactions)
    )
    router.get('/txs', this.cacheShort(), transactions.list.bind(transactions))
    router.post('/tx/send', transactions.send.bind(transactions))
    router.get(
      '/rawtx/:txid',
      this.cacheLong(),
      transactions.rawTransaction.bind(transactions),
      transactions.showRaw.bind(transactions)
    )
    router.get('/search-logs', this.cacheShort(), transactions.searchLogs.bind(transactions))

    let addresses = this.addressController
    router.get(
      '/address/:address',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.show.bind(addresses)
    )
    router.get(
      '/address/:address/utxo',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.utxo.bind(addresses)
    )
    router.get(
      '/address/:address/full-txs',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.fullTxs.bind(addresses)
    )
    router.get(
      '/address/:address/txs',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.balanceTxs.bind(addresses)
    )
    router.get(
      '/address/:address/token-txs',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.tokenTxs.bind(addresses)
    )
    router.get(
      '/address/:address/balance',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.balance.bind(addresses)
    )
    router.get(
      '/address/:address/total-received',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.totalReceived.bind(addresses)
    )
    router.get(
      '/address/:address/total-sent',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.totalSent.bind(addresses)
    )
    router.get(
      '/address/:address/unconfirmed-balance',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.unconfirmedBalance.bind(addresses)
    )
    router.get(
      '/address/:address/staking-balance',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.stakingBalance.bind(addresses)
    )
    router.get(
      '/address/:address/mature-balance',
      this.cacheShort(),
      addresses.checkAddresses.bind(addresses),
      addresses.matureBalance.bind(addresses)
    )

    let contracts = this.contractController
    router.get(
      '/contract/tokens',
      this.cacheShort(),
      contracts.tokens.bind(contracts)
    )
    router.get(
      '/contract/:contract',
      this.cacheShort(),
      contracts.contract.bind(contracts),
      contracts.show.bind(contracts)
    )
    router.get(
      '/contract/:contract/txs',
      this.cacheShort(),
      contracts.contract.bind(contracts),
      contracts.txs.bind(contracts)
    )
    router.get(
      '/contract/:contract/rich-list',
      this.cacheShort(),
      contracts.contract.bind(contracts),
      contracts.richList.bind(contracts)
    )

    let stats = this.statsController
    router.get(
      '/stats/daily-transactions',
      this.cacheLong(),
      stats.dailyTransactions.bind(stats)
    )
    router.get(
      '/stats/coin-stake',
      this.cacheShort(),
      stats.coinStake.bind(stats)
    )

    let searches = this.searchController
    router.get('/search/:string', searches.search.bind(searches))

    app.use(router.routes()).use(router.allowedMethods())
  }
}

module.exports = RunebaseinfoAPI
