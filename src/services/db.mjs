import Sequelize from 'sequelize'
import {Header} from '../lib/index.mjs'
import Rpc from '../rpc/index.mjs'
import generateTip from '../models/tip.mjs'
import generateHeader from '../models/header.mjs'
import generateBlock from '../models/block.mjs'
import generateAddress from '../models/address.mjs'
import generateTransaction from '../models/transaction.mjs'
import generateTransactionReceipt from '../models/transaction-receipt.mjs'
import generateTransactionOutput from '../models/transaction-output.mjs'
import generateContractTransaction from '../models/contract-transaction.mjs'
import generateBalanceChange from '../models/balance-change.mjs'
import generateContract from '../models/contract.mjs'
import generateToken from '../models/token.mjs'
import Service from './base.mjs'

class DBService extends Service {
  #genesisHash = null
  #rpcOptions = null
  #sequelize = null
  #Tip = null

  constructor(options) {
    super(options)
    this.#genesisHash = Header.fromBuffer(this.chain.genesis).hash
    this.#rpcOptions = {
      protocol: process.env.RPC_PROTOCOL || 'http',
      host: process.env.RPC_HOST || 'localhost',
      port: parseInt(process.env.RPC_PORT) || 3889,
      user: process.env.RPC_USER || 'user',
      password: process.env.RPC_PASS || 'password'
    }
    this.node.on('stopping', () => {
      this.logger.warn('DB Service: node is stopping, gently closing the database. Please wait, this could take a while')
    })
  }

  get APIMethods() {
    return {
      getRpcClient: this.getRpcClient.bind(this),
      getDatabase: this.getDatabase.bind(this),
      getModel: this.getModel.bind(this),
      getServiceTip: this.getServiceTip.bind(this),
      updateServiceTip: this.updateServiceTip.bind(this)
    }
  }

  getRpcClient() {
    return new Rpc(this.#rpcOptions)
  }

  getDatabase() {
    return this.#sequelize
  }

  getModel(name) {
    return this.#sequelize.models[name]
  }

  async getServiceTip(serviceName) {
    let tip = await this.#Tip.findByPk(serviceName)
    if (tip) {
      return {height: tip.height, hash: tip.hash}
    } else {
      return {height: 0, hash: this.#genesisHash}
    }
  }

  async updateServiceTip(serviceName, tip) {
    await this.#Tip.upsert({service: serviceName, height: tip.height, hash: tip.hash})
  }

  async start() {
    let dbName = process.env.DB_NAME || 'runebaseinfo'
    let dbUser = process.env.DB_USER || 'root'
    let dbPass = process.env.DB_PASS || ''
    let dbHost = process.env.DB_HOST || 'localhost'
    let dbPort = parseInt(process.env.DB_PORT) || 3306
    this.#sequelize = new Sequelize(dbName, dbUser, dbPass, {
      host: dbHost,
      port: dbPort,
      dialect: 'mysql',
      dialectOptions: {
        supportBigNumbers: true,
        bigNumberStrings: true
      },
      logging: false
    })
    generateTip(this.#sequelize)
    generateHeader(this.#sequelize)
    generateAddress(this.#sequelize)
    generateBlock(this.#sequelize)
    generateTransaction(this.#sequelize)
    generateTransactionReceipt(this.#sequelize)
    generateTransactionOutput(this.#sequelize)
    generateContractTransaction(this.#sequelize)
    generateBalanceChange(this.#sequelize)
    generateContract(this.#sequelize)
    generateToken(this.#sequelize)
    this.#Tip = this.#sequelize.models.tip
  }

  async stop() {
    if (this.#sequelize) {
      this.#sequelize.close()
      this.#sequelize = null
    }
  }
}

export default DBService
