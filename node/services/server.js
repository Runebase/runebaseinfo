const http = require('http')
const { Server: SocketIOServer } = require('socket.io')
const Service = require('./base')

class ServerService extends Service {
  #options = null
  #bus = null
  #io = null
  #httpServer = null

  constructor(options) {
    super(options)
    this.#options = options
  }

  static get dependencies() {
    return ['block', 'mempool']
  }

  async start() {
    this.#bus = this.node.openBus({remoteAddress: 'localhost-server'})
    this.#bus.on('block/block', this._onBlock.bind(this))
    this.#bus.subscribe('block/block')
    this.#bus.on('block/reorg', this._onReorg.bind(this))
    this.#bus.subscribe('block/reorg')
    this.#bus.on('mempool/transaction', this._onMempoolTransaction.bind(this))
    this.#bus.subscribe('mempool/transaction')

    const port = this.#options.port || 3001
    this.#httpServer = http.createServer()
    this.#io = new SocketIOServer(this.#httpServer, {
      serveClient: false,
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    })
    this.#io.on('connection', this._onConnection.bind(this))
    this.#httpServer.listen(port)
  }

  async stop() {
    this.#io.close()
    this.#httpServer.close()
  }

  _onConnection(socket) {
    socket.emit('tip', this.node.getBlockTip())
  }

  _onBlock(block) {
    this.#io.emit('block', {hash: block.hash, height: block.height})
  }

  _onReorg(block) {
    this.#io.emit('reorg', {hash: block.hash, height: block.height})
  }

  _onMempoolTransaction(transaction) {
    this.#io.emit('mempool-transaction', transaction.id)
  }
}

module.exports = ServerService
