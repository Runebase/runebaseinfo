const {promisify} = require('util')
const path = require('path')
const fs = require('fs')
const mongoose = require('mongoose')
const runebaseinfo = require('runebaseinfo-lib')
const BaseService = require('../service')
const Transaction = require('../models/transaction')
const TransactionOutput = require('../models/transaction-output')
const Contract = require('../models/contract')
const Balance = require('../models/balance')
const {MethodAbi, EventAbi} = require('../models/contract-abi')
const {BN} = runebaseinfo.crypto

const tokenAbi = new runebaseinfo.contract.Contract(runebaseinfo.contract.tokenABI)
const TOKEN_EVENTS = {
  Transfer: tokenAbi.eventSignature('Transfer').slice(2),
  Approval: tokenAbi.eventSignature('Approval').slice(2),
  Mint: tokenAbi.eventSignature('Mint').slice(2),
  Burn: tokenAbi.eventSignature('Burn').slice(2)
}
const TOKEN_EVENT_HASHES = Object.values(TOKEN_EVENTS)
const abiEncoding = runebaseinfo.contract.encoding

class ContractService extends BaseService {
  constructor(options) {
    super(options)
    this._network = this.node.network
    this._client = this.node.getRpcClient()
    if (this._network === 'livenet') {
      this._network = 'mainnet'
    } else if (this._network === 'regtest') {
      this._network = 'testnet'
    }
    this._contractCodeDirectory = path.resolve(this.node.datadir, 'contract-code')
  }

  static get dependencies() {
    return ['address', 'block', 'db']
  }

  get APIMethods() {
    return {
      getContract: this.getContract.bind(this),
      getContractHistory: this.getContractHistory.bind(this),
      getContractSummary: this.getContractSummary.bind(this),
      getTokenTransfers: this.getTokenTransfers.bind(this),
      getAddressTokenBalanceHistory: this.getAddressTokenBalanceHistory.bind(this),
      listContracts: this.listContracts.bind(this),
      listQRC20Tokens: this.listQRC20Tokens.bind(this),
      getAllQRC20TokenBalances: this.getAllQRC20TokenBalances.bind(this),
      searchQRC20Token: this.searchQRC20Token.bind(this),
      getTokenRichList: this.getTokenRichList.bind(this),
      parseContractMethod: this.parseContractMethod.bind(this),
      parseContractEvent: this.parseContractEvent.bind(this)
    }
  }

  getContract(address) {
    return Contract.findOne({address})
  }

  async getContractHistory(address, {from = 0, to = 0xffffffff} = {}) {
    let [{count, list}] = await Transaction.aggregate([
      {
        $match: {
          $or: [
            {inputAddresses: {$elemMatch: {type: 'contract', hex: address}}},
            {outputAddresses: {$elemMatch: {type: 'contract', hex: address}}},
            {'receipts.contractAddress': address},
            {'receipts.logs.address': address},
            {
              'receipts.logs': {
                $elemMatch: {
                  'topics.0': {$in: [TOKEN_EVENTS.Transfer, TOKEN_EVENTS.Mint, TOKEN_EVENTS.Burn]},
                  topics: '0'.repeat(24) + address
                }
              }
            }
          ]
        }
      },
      {
        $facet: {
          count: [{$group: {_id: null, count: {$sum: 1}}}],
          list: [
            {$sort: {'block.height': -1, index: -1}},
            {$skip: from},
            {$limit: to - from},
            {$project: {id: true}}
          ]
        }
      }
    ])
    return {
      totalCount: count[0].count,
      transactions: list.map(tx => tx.id)
    }
  }

  getContractTransactionCount(address) {
    return Transaction.count({
      $or: [
        {inputAddresses: {$elemMatch: {type: 'contract', hex: address}}},
        {outputAddresses: {$elemMatch: {type: 'contract', hex: address}}},
        {'receipts.contractAddress': address},
        {'receipts.logs.address': address},
        {
          'receipts.logs': {
            $elemMatch: {
              'topics.0': {$in: [TOKEN_EVENTS.Transfer, TOKEN_EVENTS.Mint, TOKEN_EVENTS.Burn]},
              topics: '0'.repeat(24) + address
            }
          }
        }
      ]
    })
  }

  async getContractSummary(address, options = {}) {
    let totalCount = await this.getContractTransactionCount(address)
    if (totalCount === 0) {
      return {
        balance: '0',
        totalReceived: '0',
        totalSent: '0',
        totalCount: 0
      }
    }
    let [result] = await TransactionOutput.aggregate([
      {$match: {'address.type': 'contract', 'address.hex': address}},
      {
        $group: {
          _id: null,
          totalReceived: {$sum: {$add: ['$satoshis', mongoose.Types.Decimal128.fromString('0')]}},
          totalSent: {
            $sum: {
              $cond: {
                if: {$eq: [{$ifNull: ['$input', null]}, null]},
                then: mongoose.Types.Decimal128.fromString('0'),
                else: {$add: ['$satoshis', mongoose.Types.Decimal128.fromString('0')]}
              }
            }
          }
        }
      }
    ])
    let totalReceived = result.totalReceived.toString()
    let totalSent = result.totalSent.toString()
    return {
      balance: (new BN(totalReceived)).sub(new BN(totalSent)).toString(),
      totalReceived,
      totalSent,
      totalCount
    }
  }

  async getTokenTransfers(transaction) {
    let list = []
    for (let receipt of transaction.receipts) {
      for (let {address, topics, data} of receipt.logs) {
        if (topics[0] !== TOKEN_EVENTS.Transfer || topics.length !== 3 || data.length !== 64) {
          continue
        }
        let token = await Contract.findOne({address, type: 'qrc20'})
        if (!token) {
          continue
        }
        token = {
          address,
          name: token.qrc20.name,
          symbol: token.qrc20.symbol,
          decimals: token.qrc20.decimals,
          totalSupply: token.qrc20.totalSupply,
          version: token.qrc20.version
        }
        list.push({
          token,
          from: topics[1] === '0'.repeat(64) ? null : await this._fromHexAddress(topics[1].slice(24)),
          to: topics[2] === '0'.repeat(64) ? null : await this._fromHexAddress(topics[2].slice(24)),
          amount: new BN(data, 16).toString()
        })
      }
    }
    return list
  }

  async getAddressTokenBalanceHistory(addresses, tokens, {from = 0, to = 0xffffffff} = {}) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses]
    }
    let hexAddresses = ContractService._toHexAddresses(addresses)
    let [{count, transactions}] = await Transaction.aggregate([
      {
        $match: {
          'receipts.logs': {
            $elemMatch: {
              ...(tokens === 'all' ? {} : {address: {$in: tokens}}),
              'topics.0': TOKEN_EVENTS.Transfer,
              topics: {$in: hexAddresses}
            }
          }
        }
      },
      {
        $facet: {
          count: [{$group: {_id: null, count: {$sum: 1}}}],
          transactions: [
            {$sort: {'block.height': -1, index: -1}},
            {$skip: from},
            {$limit: to - from},
            {$unwind: '$receipts'},
            {$unwind: '$receipts.logs'},
            {$project: {id: '$id', block: '$block', log: '$receipts.logs'}},
            {
              $match: {
                ...(tokens === 'all' ? {} : {'log.address': {$in: tokens}}),
                'log.topics.0': TOKEN_EVENTS.Transfer,
                'log.topics': {$in: hexAddresses}
              }
            },
            {
              $lookup: {
                from: 'contracts',
                localField: 'log.address',
                foreignField: 'address',
                as: 'token'
              }
            },
            {$match: {'token.type': 'qrc20'}},
            {$unwind: '$token'},
            {
              $group: {
                _id: '$id',
                block: {$first: '$block'},
                index: {$first: '$index'},
                logs: {
                  $push: {
                    token: {
                      address: '$token.address',
                      name: '$token.qrc20.name',
                      symbol: '$token.qrc20.symbol',
                      decimals: '$token.qrc20.decimals',
                      totalSupply: '$token.qrc20.totalSupply'
                    },
                    topics: '$log.topics',
                    data: '$log.data'
                  }
                }
              }
            },
            {$sort: {'block.height': -1, index: -1}},
            {$project: {_id: false, id: '$_id', block: '$block', logs: '$logs'}}
          ]
        }
      }
    ])
    return {
      totalCount: count.length && count[0].count,
      transactions: transactions.map(transaction => {
        let tokens = new Map()
        for (let {token, topics, data} of transaction.logs) {
          let delta = new BN()
          if (hexAddresses.includes(topics[1])) {
            delta.isub(new BN(data, 16))
          }
          if (hexAddresses.includes(topics[2])) {
            delta.iadd(new BN(data, 16))
          }
          if (tokens.has(token.address)) {
            tokens.get(token.address).amount.iadd(delta)
          } else {
            tokens.set(token.address, Object.assign({token, amount: delta}))
          }
        }
        return {
          id: transaction.id,
          block: transaction.block,
          data: [...tokens.values()].map(item => ({token: item.token, amount: item.amount.toString()}))
        }
      })
    }
  }

  listContracts() {
    return Contract.find()
  }

  async listQRC20Tokens({from = 0, to = 0xffffffff} = {}) {
    let [{count, tokens}] = await Contract.aggregate([
      {$match: {type: 'qrc20'}},
      {$project: {address: '$address', qrc20: '$qrc20'}},
      {
        $lookup: {
          from: 'balances',
          localField: 'address',
          foreignField: 'contract',
          as: 'balance'
        }
      },
      {$unwind: '$balance'},
      {
        $group: {
          _id: '$address',
          qrc20: {$first: '$qrc20'},
          holders: {
            $sum: {
              $cond: {
                if: {$eq: ['$balance.address', '0'.repeat(40)]},
                then: 0,
                else: 1
              }
            }
          }
        }
      },
      {
        $facet: {
          count: [{$group: {_id: null, count: {$sum: 1}}}],
          tokens: [
            {$sort: {holders: -1}},
            {$skip: from},
            {$limit: to - from},
            {
              $project: {
                _id: false,
                address: '$_id',
                name: '$qrc20.name',
                symbol: '$qrc20.symbol',
                decimals: '$qrc20.decimals',
                totalSupply: '$qrc20.totalSupply',
                holders: '$holders'
              }
            }
          ]
        }
      }
    ])
    return {totalCount: count.length ? count[0].count : 0, tokens}
  }

  async getAllQRC20TokenBalances(addresses) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses]
    }
    let hexAddresses = addresses
      .filter(address => ['pubkey', 'pubkeyhash', 'contract'].includes(address.type))
      .map(address => address.hex)
    let list = await Balance.aggregate([
      {$match: {address: {$in: hexAddresses}}},
      {$group: {_id: '$contract', balances: {$push: '$balance'}}},
      {
        $lookup: {
          from: 'contracts',
          localField: '_id',
          foreignField: 'address',
          as: 'contract'
        }
      },
      {$match: {'contract.type': 'qrc20'}},
      {$unwind: '$contract'},
      {$project: {_id: false, contract: '$contract', balances: '$balances'}}
    ])
    return list.map(({contract, balances}) => {
      let sum = new BN()
      for (let balance of balances) {
        sum.iadd(new BN(balance, 16))
      }
      return {
        address: contract.address,
        name: contract.qrc20.name,
        symbol: contract.qrc20.symbol,
        decimals: contract.qrc20.decimals,
        totalSupply: contract.qrc20.totalSupply,
        version: contract.qrc20.version,
        balance: sum.toString()
      }
    })
  }

  async searchQRC20Token(name) {
    let regex = new RegExp(name, 'i')
    let result = await Contract.aggregate([
      {$match: {$or: [{'qrc20.name': regex}, {'qrc20.symbol': regex}]}},
      {$project: {address: '$address', qrc20: '$qrc20'}},
      {
        $lookup: {
          from: 'balances',
          localField: 'address',
          foreignField: 'contract',
          as: 'balance'
        }
      },
      {$unwind: '$balance'},
      {
        $group: {
          _id: '$address',
          qrc20: {$first: '$qrc20'},
          holders: {
            $sum: {
              $cond: {
                if: {$eq: ['$balance.address', '0'.repeat(40)]},
                then: 0,
                else: 1
              }
            }
          }
        }
      },
      {$sort: {holders: -1}},
      {$limit: 1},
      {
        $project: {
          _id: false,
          address: '$_id',
          qrc20: '$qrc20',
          holders: '$holders'
        }
      }
    ])
    return result[0]
  }

  async parseContractMethod(callData) {
    let signature = callData.slice(0, 8)
    let data = callData.slice(8)
    let abiList = await MethodAbi.find({id: signature, type: 'function'}, {_id: false, id: false})
    let result = []
    for (let abi of abiList) {
      try {
        let params = abiEncoding.decode(abiEncoding.getAbiInputTypes(abi), Buffer.from(data, 'hex'))
        let parsedParams = []
        for (let index = 0; index < abi.inputs.length; ++index) {
          parsedParams.push(this.parseContractParam(abi.inputs[index], params[index]))
        }
        result.push({abi, params: parsedParams})
      } catch (err) {}
    }
    return result
  }

  async parseContractEvent({topics, data}) {
    let result = []
    let abiList = await EventAbi.find({id: topics[0]})
    for (let abi of abiList) {
      try {
        let indexedInputs = abi.inputs.filter(input => input.indexed)
        let unindexedInputs = abi.inputs.filter(input => !input.indexed)
        let indexedParams = []
        for (let index = 1; index < topics.length; ++index) {
          let input = indexedInputs[index - 1]
          let [param] = abiEncoding.decode(
            abiEncoding.getAbiInputTypes({inputs: [input]}),
            Buffer.from(topics[index], 'hex')
          )
          indexedParams.push(param)
        }
        let unindexedParams = abiEncoding.decode(
          abiEncoding.getAbiInputTypes({inputs: unindexedInputs}),
          Buffer.from(data, 'hex')
        )
        let params = []
        for (let index = 0, i = 0, j = 0; index < abi.inputs.length; ++index) {
          let input = abi.inputs[index]
          if (input.indexed) {
            params.push(this.parseContractParam(input, indexedParams[i++]))
          } else {
            params.push(this.parseContractParam(input, unindexedParams[j++]))
          }
        }
        result.push({abi, params})
      } catch (err) {}
    }
    return result
  }

  async start() {
    this._tip = await this.node.getServiceTip(this.name)
    let blockTip = this.node.getBlockTip()
    if (this._tip.height > blockTip.height) {
      this._tip = blockTip
      await this.node.updateServiceTip(this.name, this._tip)
    }
    try {
      await promisify(fs.access)(this._contractCodeDirectory)
    } catch (err) {
      await promisify(fs.mkdir)(this._contractCodeDirectory)
    }
    for (let x of ['80', '81', '82', '83', '84']) {
      let dgpAddress = '0'.repeat(38) + x
      await Contract.findOneAndUpdate(
        {address: dgpAddress},
        {createHeight: 0, type: 'dgp'},
        {upsert: true}
      )
    }
    await Contract.deleteMany({createHeight: {$gt: blockTip.height}})
  }

  async onBlock(block) {
    if (block.height === 0) {
      return
    }
    for (let tx of block.transactions) {
      for (let i = 0; i < tx.outputs.length; ++i) {
        let output = tx.outputs[i]
        if (output.script.isContractCreate()) {
          let address = TransactionOutput.getAddress(tx, i).hex
          try {
            await this._client.callContract(address, '00')
          } catch (err) {
            continue
          }
          let owner = (await TransactionOutput.findOne({
            'input.transactionId': tx.id,
            'input.index': 0
          })).address
          await this._createContract(address, {transaction: tx, block, owner})
        }
      }
    }
    await this._processReceipts(block)
    if (this._synced) {
      await this._syncContracts()
    }
    this._tip.height = block.height
    this._tip.hash = block.hash
    await this.node.updateServiceTip(this.name, this._tip)
  }

  async onReorg(_, block) {
    let contracts = (await Contract.find({createHeight: block.height}, {address: true}))
      .map(contract => contract.address)
    await Contract.deleteMany({createHeight: block.height})
    await Balance.deleteMany({contract: {$in: contracts}})
    let balanceChanges = new Set()
    let transfers = await Transaction.aggregate([
      {$match: {'block.height': block.height, 'receipts.logs.topics.0': TOKEN_EVENTS.Transfer}},
      {$project: {_id: false, receipts: '$receipts'}},
      {$unwind: '$receipts'},
      {$unwind: '$receipts.logs'},
      {
        $project: {
          address: '$receipts.logs.address',
          topics: '$receipts.logs.topics'
        }
      },
      {$match: {'topics.0': TOKEN_EVENTS.Transfer}}
    ])
    for (let {address, topics} of transfers) {
      if (topics.length > 2) {
        balanceChanges.add(address + ' ' + topics[1].slice(24))
        balanceChanges.add(address + ' ' + topics[2].slice(24))
      }
    }
    await this._updateBalances(balanceChanges)
  }

  async onSynced() {
    this._synced = true
    await this._syncContracts()
  }

  async _syncContracts() {
    let result = await this._client.listContracts(1, 1e8)
    let contractSet = new Set(Object.keys(result))
    let originalContracts = await Contract.find({type: {$ne: 'dgp'}}, {_id: false, address: true})
    let contractsToRemove = []
    for (let {address} of originalContracts) {
      if (contractSet.has(address)) {
        contractSet.delete(address)
      } else {
        contractsToRemove.push(address)
      }
    }
    await Contract.deleteMany({address: {$in: contractsToRemove}})
    await Balance.deleteMany({contract: {$in: contractsToRemove}})
    for (let address of contractSet) {
      await this._createContract(address)
    }
  }

  async _createContract(address, {transaction, block, owner} = {}) {
    if (await Contract.findOne({address})) {
      return
    }
    let code = await this._client.getContractCode(address)
    let contract = new Contract({
      address,
      ...(owner ? {owner, createTransactionId: transaction.id, createHeight: block.height} : {})
    })
    await promisify(fs.writeFile)(
      path.resolve(this._contractCodeDirectory, address + '.code'),
      Buffer.from(code, 'hex')
    )
    try {
      let [{totalSupply}, {balance}] = await Promise.all(await this._batchCallMethods([
        {address, abi: tokenAbi, method: 'totalSupply'},
        {address, abi: tokenAbi, method: 'balanceOf', args: ['0'.repeat(40)]}
      ]))
      contract.qrc20.totalSupply = totalSupply.toString()
      contract.type = 'qrc20'
      let [nameResult, symbolResult, decimalsResult, versionResult] = await this._batchCallMethods([
        {address, abi: tokenAbi, method: 'name'},
        {address, abi: tokenAbi, method: 'symbol'},
        {address, abi: tokenAbi, method: 'decimals'},
        {address, abi: tokenAbi, method: 'version'}
      ])
      try {
        contract.qrc20.name = (await nameResult).name
      } catch (err) {}
      try {
        contract.qrc20.symbol = (await symbolResult).symbol
      } catch (err) {}
      try {
        contract.qrc20.decimals = (await decimalsResult).decimals
      } catch (err) {}
      try {
        contract.qrc20.version = (await versionResult).version
      } catch (err) {}
      if (owner) {
        await this._updateBalances([address + ' ' + owner.hex])
      }
    } catch (err) {}
    await contract.save()
  }

  async _callMethod(address, abi, method, ...args) {
    let {executionResult} = await this._client.callContract(
      address,
      abi.encodeMethod(method, ...args.map(arg => '0x' + arg)).slice(2)
    )
    if (executionResult.excepted === 'None') {
      return abi.decodeMethod(method, '0x' + executionResult.output)
    } else {
      throw executionResult.excepted
    }
  }

  async _batchCallMethods(callList) {
    let results = await this._client.batch(() => {
      for (let {address, abi, method, args = []} of callList) {
        this._client.callContract(
          address,
          abi.encodeMethod(method, ...args.map(arg => '0x' + arg)).slice(2)
        )
      }
    })
    return results.map(async (result, index) => {
      let {abi, method} = callList[index]
      let {executionResult} = await result
      if (executionResult.excepted === 'None') {
        return abi.decodeMethod(method, '0x' + executionResult.output)
      } else {
        throw executionResult.excepted
      }
    })
  }

  async _fromHexAddress(data) {
    if (await Contract.findOne({address: data})) {
      return {type: 'contract', hex: data}
    } else {
      return {type: 'pubkeyhash', hex: data}
    }
  }

  static _toHexAddresses(addresses) {
    return addresses
      .filter(address => ['pubkey', 'pubkeyhash', 'contract'].includes(address.type))
      .map(address => '0'.repeat(24) + address.hex)
  }

  async _processReceipts(block) {
    let receiptIndices = []
    for (let i = 0; i < block.transactions.length; ++i) {
      let tx = block.transactions[i]
      for (let output of tx.outputs) {
        if (output.script.isContractCreate() || output.script.isContractCall()) {
          receiptIndices.push(i)
          break
        }
      }
    }
    if (receiptIndices.length === 0) {
      return
    }
    let blockReceipts = await Promise.all(await this._client.batch(() => {
      for (let index of receiptIndices) {
        this._client.getTransactionReceipt(block.transactions[index].id)
      }
    }))
    let balanceChanges = new Set()
    let totalSupplyChanges = new Set()
    for (let index = 0; index < receiptIndices.length; ++index) {
      let tx = block.transactions[receiptIndices[index]]
      await Transaction.findOneAndUpdate(
        {id: tx.id},
        {
          receipts: blockReceipts[index].map(receipt => ({
            gasUsed: receipt.gasUsed,
            contractAddress: receipt.contractAddress,
            excepted: receipt.excepted,
            logs: receipt.log
          }))
        }
      )
      for (let {transactionHash, gasUsed, contractAddress, log} of blockReceipts[index]) {
        for (let {address, topics, data} of log) {
          if (address !== contractAddress) {
            let transaction = block.transactions.find(tx => tx.id === transactionHash)
            if (!await Contract.findOne({address})) {
              await this._createContract(address)
            }
          }
          if (topics[0] === TOKEN_EVENTS.Transfer) {
            if (topics.length > 2) {
              balanceChanges.add(address + ' ' + topics[1].slice(24))
              balanceChanges.add(address + ' ' + topics[2].slice(24))
            }
          } else if ([TOKEN_EVENTS.Mint, TOKEN_EVENTS.Burn].includes(topics[0])) {
            totalSupplyChanges.add(address)
          }
        }
      }
    }
    await this._updateBalances(balanceChanges)
    for (let address of totalSupplyChanges) {
      let contract = await Contract.findOne({address, type: 'qrc20'})
      if (!contract) {
        continue
      }
      let {totalSupply} = await this._callMethod(address, tokenAbi, 'totalSupply')
      contract.qrc20.totalSupply = totalSupply.toString()
      await contract.save()
    }
  }

  async _updateBalances(balanceChanges) {
    for (let item of balanceChanges) {
      let [contract, address] = item.split(' ')
      try {
        let {balance} = await this._callMethod(contract, tokenAbi, 'balanceOf', address)
        await Balance.update(
          {contract, address},
          {balance: balance.toString(16).padStart(64, '0')},
          {upsert: true}
        )
      } catch (err) {}
    }
  }

  async qrc20TokenSnapshot(address, height) {
    let token = await Contract.findOne({address, type: 'qrc20'})
    if (!token) {
      return
    }
    if (height == null) {
      height = this.node.getBlockTip().height
    }
    if (height < token.createHeight) {
      return []
    }
    let addressResults = await Balance.find({contract: address})
    let previousTransfers = await Transaction.aggregate([
      {
        $match: {
          'block.height': {$gt: height},
          'receipts.logs': {$elemMatch: {address, 'topics.0': TOKEN_EVENTS.Transfer}}
        }
      },
      {$project: {_id: false, receipts: '$receipts'}},
      {$unwind: '$receipts'},
      {$unwind: '$receipts.logs'},
      {
        $project: {
          address: '$receipts.logs.address',
          topics: '$receipts.logs.topics',
          data: '$receipts.logs.data'
        }
      },
      {$match: {address, 'topics.0': TOKEN_EVENTS.Transfer}},
      {$project: {topics: '$topics', data: '$data'}}
    ])
    let mapping = new Map()
    for (let {address, balance} of addressResults) {
      mapping.set(address, new BN(balance, 16))
    }
    for (let {topics, data} of previousTransfers) {
      let from = topics[1].slice(24)
      let to = topics[2].slice(24)
      let amount = new BN(data, 16)
      if (mapping.has(from)) {
        mapping.get(from).iadd(amount)
      }
      if (mapping.has(to)) {
        mapping.get(to).isub(amount)
      }
    }
    let results = []
    for (let [address, balance] of mapping) {
      if (!balance.isZero()) {
        results.push({address, balance})
      }
    }
    results.sort((x, y) => y.balance.cmp(x.balance))
    for (let result of results) {
      result.balance = result.balance.toString()
    }
    return results
  }

  async getTokenRichList(token, {from = 0, to = 100} = {}) {
    let totalCount = await Balance.count({contract: token})
    let list = await Balance.find(
      {contract: token, balance: {$ne: '0'.repeat(64)}},
      {_id: false, contract: false}
    ).sort({balance: -1}).skip(from).limit(to - from)
    return {
      totalCount,
      list: list.map(({address, balance}) => ({
        address: {type: 'pubkeyhash', hex: address},
        balance: new BN(balance, 16).toString()
      }))
    }
  }

  parseContractParam(input, data) {
    if (input.type.includes('[')) {
      let itemType = input.type.slice(0, input.type.indexOf('['))
      return data.map(item => this.parseContractParam({type: itemType}, item))
    } else if (input.type.startsWith('uint') || input.type.startsWith('int')) {
      return data.toString()
    } else if (input.type.startsWith('ufixed') || input.type.startsWith('fixed')) {
      return data.toString()
    } else if (input.type === 'address') {
      return data
    } else if (input.type.startsWith('bytes') || input.type === 'function') {
      return data.toString('hex')
    } else if (input.type === 'string') {
      return data
    } else if (input.type === 'bool') {
      return data
    } else if (input.type === 'tuple') {
      return data
    } else {
      return data
    }
  }
}

module.exports = ContractService
