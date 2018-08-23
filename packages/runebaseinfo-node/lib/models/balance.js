const mongoose = require('mongoose')
const {Schema} = mongoose

const balanceSchema = new Schema({
  contract: {type: String, index: true},
  address: {type: String, index: true},
  balance: {type: String, index: true}
})

module.exports = mongoose.model('Balance', balanceSchema)
