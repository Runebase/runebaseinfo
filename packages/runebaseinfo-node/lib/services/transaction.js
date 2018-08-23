const assert = require('assert')
const {BN} = require('runebaseinfo-lib').crypto
const BaseService = require('../service')
const Transaction = require('../models/transaction')
const TransactionOutput = require('../models/transaction-output')
const {toRawTransaction} = require('../utils')

class TransactionService extends BaseService {
  constructor(options) {
    super(options)
    this._network = this.node.network
    if (this._network === 'livenet') {
      this._network = 'mainnet'
    } else if (this._network === 'regtest') {
      this._network = 'testnet'
    }
    this._tip = null
  }

  static get dependencies() {
    return ['block', 'db']
  }

  get APIMethods() {
    return {
      getTransaction: this.getTransaction.bind(this),
      setTxMetaInfo: this.setTxMetaInfo.bind(this),
      searchLogs: this.searchLogs.bind(this)
    }
  }

  async getTransaction(txid) {
    let tx = await this._getTransaction(txid)
    if (tx) {
      await this.setTxMetaInfo(tx)
      return tx
    }
  }

  async setTxMetaInfo(tx) {
    let outputSatoshis = new BN(0)
    for (let output of tx.outputs) {
      outputSatoshis.iadd(new BN(output.satoshis.toString()))
    }
    tx.outputSatoshis = outputSatoshis.toString()
    if (tx.inputs.length === 1) {
      let txo = await TransactionOutput.findById(tx.inputs[0]._id)
      if (txo.output.transactionId === '0'.repeat(64) && txo.output.index === 0xffffffff) {
        tx.isCoinbase = true
        return
      }
    }
    let inputSatoshis = new BN(0)
    for (let input of tx.inputs) {
      inputSatoshis.iadd(new BN(input.satoshis.toString()))
    }
    tx.inputSatoshis = inputSatoshis.toString()
    tx.feeSatoshis = inputSatoshis.sub(outputSatoshis).toString()
  }

  async _getTransaction(txid) {
    let list = await Transaction.aggregate([
      {$match: {id: txid}},
      {$unwind: '$inputs'},
      {
        $lookup: {
          from: 'transactionoutputs',
          localField: 'inputs',
          foreignField: '_id',
          as: 'input'
        }
      },
      {
        $group: {
          _id: '$_id',
          id: {$first: '$id'},
          hash: {$first: '$hash'},
          version: {$first: '$version'},
          marker: {$first: '$marker'},
          flags: {$first: '$flags'},
          inputs: {
            $push: {
              _id: {$arrayElemAt: ['$input._id', 0]},
              prevTxId: {$arrayElemAt: ['$input.output.transactionId', 0]},
              outputIndex: {$arrayElemAt: ['$input.output.index', 0]},
              script: {$arrayElemAt: ['$input.input.script', 0]},
              sequence: {$arrayElemAt: ['$input.input.sequence', 0]},
              satoshis: {$arrayElemAt: ['$input.satoshis', 0]},
              address: {$arrayElemAt: ['$input.address', 0]}
            }
          },
          outputs: {$first: '$outputs'},
          inputAddresses: {$first: 'inputAddresses'},
          outputAddresses: {$first: 'outputAddresses'},
          witnessStack: {$first: '$witnessStack'},
          nLockTime: {$first: '$nLockTime'},
          block: {$first: '$block'},
          receipts: {$first: '$receipts'},
          size: {$first: '$size'},
          weight: {$first: '$weight'}
        }
      },
      {$unwind: '$outputs'},
      {
        $lookup: {
          from: 'transactionoutputs',
          localField: 'outputs',
          foreignField: '_id',
          as: 'output'
        }
      },
      {
        $group: {
          _id: '$_id',
          id: {$first: '$id'},
          hash: {$first: '$hash'},
          version: {$first: '$version'},
          marker: {$first: '$marker'},
          flags: {$first: '$flags'},
          inputs: {$first: '$inputs'},
          outputs: {
            $push: {
              _id: {$arrayElemAt: ['$output._id', 0]},
              satoshis: {$arrayElemAt: ['$output.satoshis', 0]},
              script: {$arrayElemAt: ['$output.output.script', 0]},
              address: {$arrayElemAt: ['$output.address', 0]}
            }
          },
          inputAddresses: {$first: 'inputAddresses'},
          outputAddresses: {$first: 'outputAddresses'},
          witnessStack: {$first: '$witnessStack'},
          nLockTime: {$first: '$nLockTime'},
          block: {$first: '$block'},
          receipts: {$first: '$receipts'},
          size: {$first: '$size'},
          weight: {$first: '$weight'}
        }
      },
      {
        $lookup: {
          from: 'blocks',
          localField: 'block.hash',
          foreignField: 'hash',
          as: 'block'
        }
      },
      {$addFields: {block: {$arrayElemAt: ['$block', 0]}}}
    ])
    return list[0]
  }

  async start() {
    this._tip = await this.node.getServiceTip(this.name)
    let blockTip = this.node.getBlockTip()
    if (this._tip.height > blockTip.height) {
      this._tip = blockTip
      await this.node.updateServiceTip(this.name, this._tip)
    }
    await Transaction.deleteMany({'block.height': {$gt: blockTip.height}})
    await TransactionOutput.deleteMany({'output.height': {$gt: blockTip.height}})
    await TransactionOutput.updateMany(
      {'input.height': {$gt: blockTip.height}},
      {$unset: {input: ''}}
    )
  }

  async onBlock(block) {
    if (this.node.stopping) {
      return
    }
    for (let i = 0; i < block.transactions.length; ++i) {
      await this._processTransaction(block.transactions[i], i, block)
    }
    this._tip.height = block.height
    this._tip.hash = block.hash
    await this.node.updateServiceTip(this.name, this._tip)
  }

  async _processTransaction(tx, indexInBlock, block) {
    let inputAddresses = new Set()
    let outputAddresses = new Set()
    let inputs = []
    for (let index = 0; index < tx.inputs.length; ++index) {
      let input = tx.inputs[index]
      let txo
      if (Buffer.compare(input.prevTxId, Buffer.alloc(32)) === 0) {
        txo = new TransactionOutput({
          output: {height: block.height},
          input: {
            height: block.height,
            transactionId: tx.id,
            index,
            script: input.script.toBuffer(),
            sequence: input.sequenceNumber
          },
          isStake: tx.outputs[0].script.chunks.length === 0
        })
      } else {
        txo = await TransactionOutput.findOne({
          'output.transactionId': input.prevTxId.toString('hex'),
          'output.index': input.outputIndex
        })
        txo.input = {
          height: block.height,
          transactionId: tx.id,
          index: index,
          script: input.script.toBuffer(),
          sequence: input.sequenceNumber
        }
      }
      await txo.save()
      inputs.push(txo._id)
      if (txo.address) {
        inputAddresses.add(txo.address.type + ' ' + txo.address.hex)
      }
    }

    let outputs = []
    for (let index = 0; index < tx.outputs.length; ++index) {
      let output = tx.outputs[index]
      let txo = await TransactionOutput.findOne({'output.transactionId': tx.id, 'output.index': index})
      if (txo) {
        txo.output.height = block.height
      } else {
        txo = new TransactionOutput({
          satoshis: output.satoshis.toString(),
          output: {
            height: block.height,
            transactionId: tx.id,
            index,
            script: output.script.toBuffer()
          },
          address: TransactionOutput.getAddress(tx, index),
          isStake: tx.outputs[0].script.chunks.length === 0
        })
      }
      await txo.save()
      outputs.push(txo._id)
      if (txo.address) {
        outputAddresses.add(txo.address.type + ' ' + txo.address.hex)
      }
    }

    function getAddress(item) {
      let [type, hex] = item.split(' ')
      return {type, hex}
    }

    let transaction = await Transaction.findOne({id: tx.id})
    if (transaction) {
      transaction.block.hash = block.hash
      transaction.block.height = block.height
      transaction.block.timestamp = block.header.timestamp
      transaction.index = indexInBlock
    } else {
      transaction = new Transaction({
        id: tx.id,
        hash: tx.hash,
        version: tx.version,
        marker: tx.marker,
        flags: tx.flags,
        inputs,
        outputs,
        witnessStack: tx.witnessStack,
        nLockTime: tx.nLockTime,
        block: {
          hash: block.hash,
          height: block.height,
          timestamp: block.header.timestamp
        },
        index: indexInBlock,
        inputAddresses: [...inputAddresses].map(getAddress),
        outputAddresses: [...outputAddresses].map(getAddress)
      })
    }
    await transaction.save()
    if (!transaction.size) {
      let _transaction = await this._getTransaction(tx.id)
      let rawTransaction = toRawTransaction(_transaction)
      let transactionBuffer = rawTransaction.toBuffer()
      let transactionHashBuffer = rawTransaction.toHashBuffer()
      transaction.size = transactionBuffer.length
      transaction.weight = transactionBuffer.length + transactionHashBuffer.length * 3
      await transaction.save()
    }
  }

  searchLogs({
    fromBlock, toBlock, contractAddresses, addresses, topics,
    from = 0, to = 0xffffffffffff
  } = {}) {
    let elemMatch = {}
    let match = {}
    if (fromBlock != null && toBlock != null) {
      elemMatch['block.height'] = {}
      if (fromBlock != null) {
        elemMatch['block.height'].$gte = fromBlock
      }
      if (toBlock != null) {
        elemMatch['block.height'].$lte = toBlock
      }
    }
    if (contractAddresses || addresses || topics) {
      elemMatch.receipts = {$elemMatch: {excepted: 'None'}}
      if (Array.isArray(contractAddresses)) {
        elemMatch.receipts.$elemMatch.contractAddress = {$in: contractAddresses}
        match['receipts.contractAddress'] = {$in: contractAddresses}
      } else if (contractAddresses) {
        elemMatch.receipts.$elemMatch.contractAddress = contractAddresses
        match['receipts.contractAddress'] = contractAddresses
      }
      if (addresses || topics) {
        elemMatch.receipts.$elemMatch.logs = {$elemMatch: {}}
        if (Array.isArray(addresses)) {
          elemMatch.receipts.$elemMatch.logs.$elemMatch.address = {$in: addresses}
          match['receipts.logs.address'] = {$in: addresses}
        } else if (addresses) {
          elemMatch.receipts.$elemMatch.logs.$elemMatch.address = addresses
          match['receipts.logs.address'] = addresses
        }
        if (Array.isArray(topics)) {
          elemMatch.receipts.$elemMatch.logs.$elemMatch.topics = {$in: topics}
          match['receipts.logs.topics'] = {$in: topics}
        } else if (topics) {
          elemMatch.receipts.$elemMatch.logs.$elemMatch.topics = topics
          match['receipts.logs.topics'] = topics
        }
      } else {
        elemMatch.receipts.$elemMatch.logs = {$ne: []}
      }
    } else {
      elemMatch.receipts = {$elemMatch: {excepted: 'None', logs: {$ne: []}}}
    }
    return Transaction.aggregate([
      {$match: elemMatch},
      {
        $project: {
          _id: false,
          id: '$id',
          block: {
            height: '$block.height',
            hash: '$block.hash'
          },
          index: '$index',
          receipts: '$receipts'
        }
      },
      {$unwind: {path: '$receipts', includeArrayIndex: 'receiptIndex'}},
      {$match: match},
      {$sort: {'block.height': 1, index: 1, receiptIndex: 1}},
      {$skip: from},
      {$limit: to - from},
      {$unwind: '$receipts.logs'},
      {$match: match},
      {
        $group: {
          _id: {height: '$block.height', index: '$index', receiptIndex: '$receiptIndex'},
          id: {$first: '$id'},
          block: {$first: '$block'},
          contractAddress: {$first: '$receipts.contractAddress'},
          logs: {$push: '$receipts.logs'}
        }
      },
      {$sort: {'_id.height': 1, '_id.index': 1, '_id.receiptIndex': 1}},
      {
        $project: {
          _id: false,
          id: '$id',
          block: '$block',
          contractAddress: '$contractAddress',
          logs: '$logs'
        }
      }
    ])
  }
}

module.exports = TransactionService
