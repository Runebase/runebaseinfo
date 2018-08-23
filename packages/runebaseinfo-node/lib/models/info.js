const mongoose = require('mongoose')
const {Schema} = mongoose

const infoSchema = new Schema({
  key: {type: String, index: true, unique: true},
  value: Schema.Types.Mixed
})

module.exports = mongoose.model('Info', infoSchema)
