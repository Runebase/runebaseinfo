const mongoose = require('mongoose')
const addressSchema = require('./address')
const {Schema} = mongoose
require('mongoose-long')(mongoose)

const snapshotSchema = new Schema({
  address: addressSchema,
  balance: {type: Schema.Types.Long, index: true}
})

module.exports = mongoose.model('Snapshot', snapshotSchema)
