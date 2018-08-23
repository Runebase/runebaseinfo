const {BN} = require('runebaseinfo-lib').crypto
const BaseService = require('../service')
const Transaction = require('../models/transaction')
const TransactionOutput = require('../models/transaction-output')
const {toRawTransaction} = require('../utils')

class MempoolService extends BaseService {
  constructor(options) {
    super(options)
    this._subscriptions = {transaction: []}
    this.log = this.node.log
    this._network = this.node.network
    this._enabled = false
    if (this._network === 'livenet') {
      this._network = 'mainnet'
    } else if (this._network === 'regtest') {
      this._network = 'testnet'
    }
  }

  static get dependencies() {
    return ['db', 'p2p']
  }

  async onReorg(_, block) {
    await Transaction.deleteMany({'block.height': block.height, index: {$in: [0, 1]}})
    await Transaction.updateMany({'block.height': block.height}, {block: {height: 0xffffffff}})
    await TransactionOutput.updateMany({'output.height': block.height}, {'output.height': 0xffffffff})
    await TransactionOutput.updateMany({'input.height': block.height}, {'input.height': 0xffffffff})
    await TransactionOutput.deleteMany({
      $or: [
        {'output.transactionId': {$in: [block.transactions[0].id, block.transactions[1].id]}},
        {'input.transactionId': block.transactions[0].id}
      ]
    })
  }

  _startSubscriptions() {
    if (this._subscribed) {
      return
    }
    this._subscribed = true

    if (!this._bus) {
      this._bus = this.node.openBus({remoteAddress: 'localhost-mempool'})
    }
    this._bus.on('p2p/transaction', this._onTransaction.bind(this))
    this._bus.subscribe('p2p/transaction')
  }

  enable() {
    this.node.log.info('Mempool service: Mempool enabled.')
    this._startSubscriptions()
    this._enabled = true
  }

  onSynced() {
    this.enable()
  }

  async _onTransaction(tx) {
    let inputAddresses = new Set()
    let outputAddresses = new Set()
    let inputTxos = []
    for (let index = 0; index < tx.inputs.length; ++index) {
      let input = tx.inputs[index]
      let txo = await TransactionOutput.findOne({
        'output.transactionId': input.prevTxId.toString('hex'),
        'output.index': input.outputIndex
      })
      if (!txo) {
        return
      }
      inputTxos.push(txo)
    }
    let inputs = []
    for (let index = 0; index < tx.inputs.length; ++index) {
      let input = tx.inputs[index]
      let txo = inputTxos[index]
      if (txo.input) {
        await Transaction.remove({id: txo.input.transactionId})
      }
      txo.input = {
        height: 0xffffffff,
        transactionId: tx.id,
        index: index,
        script: input.script.toBuffer(),
        sequence: input.sequenceNumber
      }
      await txo.save()
      inputs.push(txo._id)
      if (txo.address) {
        inputAddresses.add(txo.address.type + ' ' + txo.address.hex)
      }
    }

    let outputs = []
    let outputTxos = []
    for (let index = 0; index < tx.outputs.length; ++index) {
      let output = tx.outputs[index]
      let txo = new TransactionOutput({
        satoshis: output.satoshis.toString(),
        output: {
          height: 0xffffffff,
          transactionId: tx.id,
          index,
          script: output.script.toBuffer()
        },
        address: TransactionOutput.getAddress(tx, index),
        isStake: tx.outputs[0].script.chunks.length === 0
      })
      await txo.save()
      outputs.push(txo._id)
      outputTxos.push(txo)
      if (txo.address) {
        outputAddresses.add(txo.address.type + ' ' + txo.address.hex)
      }
    }

    function getAddress(item) {
      let [type, hex] = item.split(' ')
      return {type, hex}
    }

    let transaction = new Transaction({
      id: tx.id,
      hash: tx.hash,
      version: tx.version,
      marker: tx.marker,
      flags: tx.flags,
      inputs,
      outputs,
      witnessStack: tx.witnessStack.map(witness => witness.map(item => item.toString('hex'))),
      nLockTime: tx.nLockTime,
      block: {height: 0xffffffff},
      inputAddresses: [...inputAddresses].map(getAddress),
      outputAddresses: [...outputAddresses].map(getAddress),
    })
    await transaction.save()
    let _transaction = await this.node.getTransaction(tx.id)
    let rawTransaction = toRawTransaction(_transaction)
    let transactionBuffer = rawTransaction.toBuffer()
    let transactionHashBuffer = rawTransaction.toHashBuffer()
    transaction.size = transactionBuffer.length
    transaction.weight = transactionBuffer.length + transactionHashBuffer.length * 3
    await transaction.save()

    let txBuffer = tx.toBuffer()
    let txHashBuffer = tx.toHashBuffer()
    let inputSatoshis = new BN(0)
    let outputSatoshis = new BN(0)
    for (let txo of inputTxos) {
      inputSatoshis.iadd(new BN(txo.satoshis.toString()))
    }
    for (let txo of outputTxos) {
      outputSatoshis.iadd(new BN(txo.satoshis.toString()))
    }
    let transformed = {
      id: transaction.id,
      size: txBuffer.length,
      weight: txBuffer.length + txHashBuffer.length * 3,
      valueIn: inputSatoshis.toString(),
      valueOut: outputSatoshis.toString(),
      fees: inputSatoshis.sub(outputSatoshis)
    }
    for (let subscription of this._subscriptions.transaction) {
      subscription.emit('mempool/transaction', transformed)
    }
  }
}

module.exports = MempoolService
