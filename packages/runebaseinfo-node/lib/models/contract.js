const mongoose = require('mongoose')
const addressSchema = require('./address')
const {Schema} = mongoose

const contractSchema = new Schema({
  address: {type: String, index: true, unique: true},
  owner: addressSchema,
  createTransactionId: String,
  createHeight: {type: Number, index: true},
  type: {type: String, index: true},
  qrc20: {
    name: {type: String, index: true},
    symbol: {type: String, index: true},
    decimals: Number,
    totalSupply: String,
    version: String
  }
})

module.exports = mongoose.model('Contract', contractSchema)
