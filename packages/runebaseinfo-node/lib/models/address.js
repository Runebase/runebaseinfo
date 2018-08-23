const mongoose = require('mongoose')
const {Schema} = mongoose

const addressSchema = new Schema({
  type: {type: String},
  hex: {type: String}
}, {_id: false})

addressSchema.index({hex: 1, type: 1})
module.exports = addressSchema
