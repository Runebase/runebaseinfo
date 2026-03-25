import Node from '../node.mjs'
import DBService from '../services/db.mjs'
import P2PService from '../services/p2p.mjs'
import HeaderService from '../services/header.mjs'
import BlockService from '../services/block.mjs'
import TransactionService from '../services/transaction.mjs'
import ContractService from '../services/contract.mjs'
import MempoolService from '../services/mempool.mjs'
import ServerService from '../services/server.mjs'

const SERVICE_MODULES = {
  db: DBService,
  p2p: P2PService,
  header: HeaderService,
  block: BlockService,
  transaction: TransactionService,
  contract: ContractService,
  mempool: MempoolService,
  server: ServerService
}

const SERVICE_NAMES = ['db', 'p2p', 'header', 'block', 'transaction', 'contract', 'mempool', 'server']

class RunebaseNode {
  #node = null
  #shuttingDown = false

  get logger() {
    return this.#node.logger
  }

  async start() {
    let services = SERVICE_NAMES.map(name => ({
      name,
      module: SERVICE_MODULES[name]
    }))
    this.#node = new Node({
      chain: process.env.CHAIN || 'mainnet',
      services
    })
    this.registerExitHandlers()
    this.#node.on('ready', () => this.logger.info('Runebaseinfo Node ready.'))
    this.#node.on('error', err => this.logger.error(err))
    this.#node.start().catch(err => {
      this.logger.error('Failed to start services')
      if (err.stack) {
        this.logger.error(err.stack)
      }
      this.cleanShutdown()
    })
  }

  exitHandler({sigint}, err) {
    if (sigint && !this.#shuttingDown) {
      this.#shuttingDown = true
      this.#node.stop()
    } else if (err) {
      this.logger.error('Uncaught exception:', err)
      if (err.stack) {
        this.logger.error(err.stack)
      }
      this.#node.stop()
    }
  }

  registerExitHandlers() {
    process.on('uncaughtException', this.exitHandler.bind(this, {exit: true}))
    process.on('SIGINT', this.exitHandler.bind(this, {sigint: true}))
  }
}

export default RunebaseNode
