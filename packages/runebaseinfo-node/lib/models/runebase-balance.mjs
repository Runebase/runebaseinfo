import mongoose from 'mongoose'
import mongooseLong from 'mongoose-long'
import addressSchema from './address'
import {BigInttoLong, LongtoBigInt} from '../utils'

mongooseLong(mongoose)

const runebaseBalanceSchema = new mongoose.Schema({
  height: Number,
  address: {type: addressSchema, index: true},
  balance: {
    type: mongoose.Schema.Types.Long,
    get: LongtoBigInt,
    set: BigInttoLong
  }
})

runebaseBalanceSchema.index({height: 1, balance: -1})

export default mongoose.model('RunebaseBalance', runebaseBalanceSchema)
