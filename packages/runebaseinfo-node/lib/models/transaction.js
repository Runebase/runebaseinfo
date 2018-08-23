const mongoose = require('mongoose')
const addressSchema = require('./address')
const {Schema} = mongoose

const blockSchema = new Schema({
  hash: {type: String, default: '0'.repeat(64)},
  height: {type: Number, default: 0xffffffff},
  timestamp: {type: Number, index: true}
}, {_id: false})

const receiptLogSchema = new Schema({
  address: {type: String, index: true},
  topics: [{type: String, index: true}],
  data: String
}, {_id: false})

const receiptSchema = new Schema({
  gasUsed: Number,
  contractAddress: {type: String, index: true},
  excepted: String,
  logs: [receiptLogSchema]
}, {_id: false})

const transactionSchema = new Schema({
  id: {type: String, index: true, unique: true},
  hash: {type: String, index: true, unique: true},
  version: Number,
  marker: Number,
  flags: Number,
  inputs: [Schema.Types.ObjectId],
  outputs: [Schema.Types.ObjectId],
  witnessStack: [[Buffer]],
  nLockTime: Number,
  block: blockSchema,
  index: Number,
  inputAddresses: [addressSchema],
  outputAddresses: [addressSchema],
  receipts: [receiptSchema],
  size: Number,
  weight: Number
})

transactionSchema.index({'block.height': 1, index: 1})
module.exports = mongoose.model('Transaction', transactionSchema)
