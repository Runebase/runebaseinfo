const mongoose = require('mongoose')
const {Schema} = mongoose

const headerSchema = new Schema({
  hash: {type: String, index: true, unique: true},
  height: {type: Number, index: true, unique: true},
  version: Number,
  prevHash: {type: String, default: '0'.repeat(64)},
  merkleRoot: String,
  timestamp: Number,
  bits: Number,
  nonce: Number,
  hashStateRoot: String,
  hashUTXORoot: String,
  prevOutStakeHash: {type: String, default: '0'.repeat(64)},
  prevOutStakeN: Number,
  vchBlockSig: String,
  chainwork: String
})

module.exports = mongoose.model('Header', headerSchema)
