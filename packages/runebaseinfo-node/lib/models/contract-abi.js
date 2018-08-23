const mongoose = require('mongoose')
const {Schema} = mongoose

const methodComponentSchema = new Schema({
  name: String,
  type: String
}, {_id: false})
methodComponentSchema.add({components: [methodComponentSchema]})

const eventComponentSchema = new Schema({
  name: String,
  type: String,
  components: [methodComponentSchema],
  indexed: Boolean
}, {_id: false})

methodAbiSchema = new Schema({
  id: {type: String, index: true},
  type: {type: String, index: true},
  name: {type: String, index: true},
  inputs: [methodComponentSchema],
  outputs: [methodComponentSchema],
  stateMutability: String
})

eventAbiSchema = new Schema({
  id: {type: String, index: true},
  type: String,
  name: {type: String, index: true},
  inputs: [eventComponentSchema],
  anonymous: Boolean
})

methodAbiSchema.method('payable', function() {
  return this.stateMutability === 'payable'
})

methodAbiSchema.method('pure', function() {
  return ['pure', 'view'].includes(this.stateMutability)
})

exports.MethodAbi = mongoose.model('MethodAbi', methodAbiSchema)
exports.EventAbi = mongoose.model('EventAbi', eventAbiSchema)
