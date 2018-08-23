const Transaction = require('runebaseinfo-node/lib/models/transaction')
const {toRawTransaction, toRawScript} = require('runebaseinfo-node/lib/utils')
const {ErrorResponse} = require('../components/utils')

class TransactionController {
  constructor(node) {
    this.node = node
    this.errorResponse = new ErrorResponse({log: this.node.log})
    this._network = this.node.network
    if (this.node.network === 'livenet') {
      this._network = 'mainnet'
    } else if (this.node.network === 'regtest') {
      this._network = 'testnet'
    }
  }

  async show(ctx) {
    if (ctx.transaction) {
      ctx.body = ctx.transaction
    } else if (ctx.transactions) {
      ctx.body = ctx.transactions
    }
  }

  async transaction(ctx, next) {
    let txid = ctx.params.txid
    let brief = 'brief' in ctx.query
    try {
      let tx = await Transaction.findOne({$or: [{id: txid}, {hash: txid}]})
      if (tx) {
        let transaction = await this.node.getTransaction(tx.id)
        ctx.transaction = await this.transformTransaction(transaction, {brief})
        await next()
      } else {
        ctx.throw(404)
      }
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async transactions(ctx, next) {
    let txids = ctx.params.txids.split(',')
    let brief = 'brief' in ctx.query
    let list = []
    try {
      for (let txid of txids) {
        let transaction = await this.node.getTransaction(txid)
        if (transaction) {
          list.push(transaction)
        } else {
          ctx.throw(404)
        }
      }
      ctx.transactions = await Promise.all(list.map(
        transaction => this.transformTransaction(transaction, {brief})
      ))
      await next()
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async transformTransaction(transaction, {brief = false} = {}) {
    let confirmations = 'block' in transaction ? this.node.getBlockTip().height - transaction.block.height + 1 : 0
    let transformed = {
      id: transaction.id,
      ...(brief ? {} : {
        hash: transaction.hash,
        version: transaction.version,
        lockTime: transaction.nLockTime,
        blockHash: transaction.block && transaction.block.hash,
      }),
      blockHeight: transaction.block && transaction.block.height,
      confirmations,
      timestamp: transaction.block && transaction.block.timestamp,
      isCoinbase: transaction.isCoinbase,
      valueOut: transaction.outputSatoshis,
      ...(brief ? {} : {
        size: transaction.size,
        weight: transaction.weight,
        receipts: transaction.receipts
      }),
      tokenTransfers: []
    }

    if (transaction.isCoinbase) {
      transformed.vin = [{
        coinbase: transaction.inputs[0].script.buffer.toString('hex'),
        ...(brief ? {} : {
          sequence: transaction.inputs[0].sequence,
          n: 0
        })
      }]
    } else {
      transformed.vin = transaction.inputs.map((input, index) => {
        let rawScript = toRawScript(input.script)
        return {
          ...(brief ? {} : {
            txid: input.prevTxId,
            vout: input.outputIndex,
            sequence: input.sequence,
            n: index,
          }),
          value: input.satoshis.toString(),
          address: input.address,
          ...(brief ? {} : {
            scriptSig: {
              hex: rawScript.toBuffer().toString('hex'),
              asm: rawScript.toString()
            }
          })
        }
      })
      transformed.valueIn = transaction.inputSatoshis
      transformed.fees = transaction.feeSatoshis
    }
    transformed.vout = await Promise.all(
      transaction.outputs.map(async (output, index) => {
        let rawScript = toRawScript(output.script)
        let address = rawScript.toAddress(this._network)
        let type
        let abiList
        if (address) {
          type = address.type
        } else if (rawScript.isDataOut()) {
          type = 'nulldata'
        } else if (rawScript.isContractCreate()) {
          type = 'create'
        } else if (rawScript.isContractCall()) {
          type = 'call'
          if (!brief) {
            abiList = await this.node.parseContractMethod(rawScript.chunks[3].buf.toString('hex'))
          }
        } else if (rawScript.chunks.length === 0) {
          type = 'nonstandard'
        }
        return {
          value: output.satoshis.toString(),
          n: index,
          address: output.address,
          scriptPubKey: {
            type,
            ...(brief ? {} : {
              hex: rawScript.toBuffer().toString('hex'),
              asm: rawScript.toString()
            })
          },
          ...(!brief && type === 'call' ? {abiList} : {})
        }
      })
    )
    transformed.tokenTransfers = await this.node.getTokenTransfers(transaction)
    if (!brief) {
      for (let receipt of transaction.receipts) {
        for (let log of receipt.logs) {
          log.abiList = await this.node.parseContractEvent(log)
        }
      }
    }
    return transformed
  }

  async rawTransaction(ctx, next) {
    let txid = ctx.params.txid

    try {
      let transaction = await this.node.getTransaction(txid)
      if (!transaction) {
        ctx.throw(404)
      }
      ctx.rawTransaction = toRawTransaction(transaction).toBuffer().toString('hex')
      await next()
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async showRaw(ctx) {
    if (ctx.rawTransaction) {
      ctx.body = ctx.rawTransaction
    }
  }

  async list(ctx) {
    let blockHash = ctx.query.block
    let address = ctx.query.address
    let page = Number.parseInt(ctx.query.pageNum) || 0
    let pageLength = Number.parseInt(ctx.query.pageLength) || 10

    if (blockHash) {
      try {
        let block = await this.node.getBlockOverview(blockHash)
        if (!block) {
          ctx.throw(404)
        }
        let totalTxs = block.txids.length
        let start = page * pageLength
        let txids = block.txids.slice(start, start + pageLength)
        let pagesTotal = Math.ceil(totalTxs / pageLength)

        let transactions = []
        for (let txid of txids) {
          let transaction = await this.node.getTransaction(txid)
          transactions.push(await this.transformTransaction(transaction))
        }

        ctx.body = {pagesTotal, transactions}
      } catch (err) {
        this.errorResponse.handleErrors(ctx, err)
      }
    } else if (address) {
      let options = {
        from: page * pageLength,
        to: (page + 1) * pageLength
      }

      try {
        let result = await this.node.getAddressHistory(address, options)
        let transactions = await result.items.map(tx => this.transformTransaction(tx))
        ctx.body = {
          pageTotal: Math.ceil(result.totalCount / pageLength),
          transactions
        }
      } catch (err) {
        this.errorResponse.handleErrors(ctx, err)
      }
    } else {
      this.errorResponse.handleErrors(ctx, new Error('Block hash or address expected'))
    }
  }

  async send(ctx) {
    let {rawtx} = ctx.request.body
    try {
      let txid = await this.node.sendTransaction(rawtx)
      ctx.body = {txid}
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }

  async searchLogs(ctx) {
    const toArray = s => s && s.split(',')
    let from = Number.parseInt(ctx.query.from) || null
    let to = Number.parseInt(ctx.query.to) || null
    let fromBlock = Number.parseInt(ctx.query.fromBlock) || null
    let toBlock = Number.parseInt(ctx.query.toBlock) || null
    let contractAddresses = toArray(ctx.query.contractAddresses)
    let addresses = toArray(ctx.query.addresses)
    let topics = toArray(ctx.query.topics)
    try {
      let results = await this.node.searchLogs(
        {fromBlock, toBlock, contractAddresses, addresses, topics},
        {from, to}
      )
      ctx.body = results
    } catch (err) {
      this.errorResponse.handleErrors(ctx, err)
    }
  }
}

module.exports = TransactionController
