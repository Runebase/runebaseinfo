const runebaseinfo = require('runebaseinfo-lib')
const Inventory = require('../inventory')

function builder(options = {}) {
  options.network = options.network || runebaseinfo.Networks.defaultNetwork
  options.Block = options.Block || runebaseinfo.Block
  options.BlockHeader = options.BlockHeader || runebaseinfo.BlockHeader
  options.Transaction = options.Transaction || runebaseinfo.Transaction
  options.MerkleBlock = options.MerkleBlock || runebaseinfo.MerkleBlock
  options.protocolVersion = options.protocolVersion || 70016

  let exported = {
    constructors: {
      Block: options.Block,
      BlockHeader: options.BlockHeader,
      Transaction: options.Transaction,
      MerkleBlock: options.MerkleBlock
    },
    defaults: {
      protocolVersion: options.protocolVersion,
      network: options.network
    },
    inventoryCommands: [
      'getdata',
      'inv',
      'notfound'
    ],
    commandsMap: {
      version: 'Version',
      verack: 'VerAck',
      ping: 'Ping',
      pong: 'Pong',
      block: 'Block',
      tx: 'Transaction',
      getdata: 'GetData',
      headers: 'Headers',
      notfound: 'NotFound',
      inv: 'Inventory',
      addr: 'Addresses',
      alert: 'Alert',
      reject: 'Reject',
      merkleblock: 'MerkleBlock',
      filterload: 'FilterLoad',
      filteradd: 'FilterAdd',
      filterclear: 'FilterClear',
      getblocks: 'GetBlocks',
      getheaders: 'GetHeaders',
      mempool: 'MemPool',
      getaddr: 'GetAddr',
      sendheaders: 'SendHeaders',
      sendcmpct: 'SendCmpct',
      feefilter: 'FeeFilter'
    },
    commands: {}
  }

  exported.add = function(key, Command) {
    exported.commands[key] = obj => new Command(obj, options)

    exported.commands[key]._constructor = Command

    exported.commands[key].fromBuffer = function(buffer) {
      let message = exported.commands[key]()
      message.setPayload(buffer)
      return message
    }
  }

  for (let key of Object.keys(exported.commandsMap)) {
    exported.add(key, require('./commands/' + key))
  }

  for (let command of exported.inventoryCommands) {
    let Command = exported.commands[command]
    Command.forTransaction = hash => new Command([Inventory.forTransaction(hash)])
    Command.forBlock = hash => new Command([Inventory.forBlock(hash)])
    Command.forFilteredBlock = hash => new Command([Inventory.forFilteredBlock(hash)])
  }

  return exported
}

module.exports = builder
