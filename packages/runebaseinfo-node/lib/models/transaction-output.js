const mongoose = require('mongoose')
const runebaseinfo = require('runebaseinfo-lib')
const addressSchema = require('./address')
const {Schema} = mongoose
const {sha256ripemd160} = runebaseinfo.crypto.Hash
require('mongoose-long')(mongoose)

const outputSchema = new Schema({
  height: {type: Number, default: 0xffffffff, index: true},
  transactionId: {type: String, default: '0'.repeat(64), index: true},
  index: {type: Number, default: 0xffffffff, index: true},
  script: Buffer
}, {_id: false})

const inputSchema = new Schema({
  height: {type: Number, index: true},
  transactionId: {type: String, index: true},
  index: {type: Number, index: true},
  script: Buffer,
  sequence: Number
}, {_id: false})

const transactionOutputSchema = new Schema({
  satoshis: {type: Schema.Types.Long, default: mongoose.Types.Long(0)},
  output: outputSchema,
  input: inputSchema,
  address: addressSchema,
  isStake: {type: Boolean, index: true}
})

exports = module.exports = mongoose.model('TransactionOutput', transactionOutputSchema)

exports.getAddress = function(tx, index) {
  let script = tx.outputs[index].script
  if (script.isContractCreate()) {
    let indexBuffer = Buffer.alloc(4)
    indexBuffer.writeUInt32LE(index)
    return {
      type: 'contract',
      hex: sha256ripemd160(
        Buffer.concat([Buffer.from(tx.id, 'hex').reverse(), indexBuffer])
      ).toString('hex')
    }
  } else if (script.isContractCall()) {
    return {
      type: 'contract',
      hex: script.chunks[4].buf.toString('hex')
    }
  } else {
    let info = script.getAddressInfo()
    if (info) {
      return {type: info.type, hex: info.hashBuffer.toString('hex')}
    }
  }
}
