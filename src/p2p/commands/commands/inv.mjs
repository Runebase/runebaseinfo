import {BufferReader, BufferWriter} from '../../../lib/index.mjs'
import Message from './message.mjs'
import {writeInventories, parseInventories} from './utils.mjs'

class InvMessage extends Message {
  constructor({inventories, ...options}) {
    super('inv', options)
    this.inventories = inventories
  }

  get payload() {
    let writer = new BufferWriter()
    writeInventories(writer, this.inventories)
    return writer.toBuffer()
  }

  set payload(payload) {
    let reader = new BufferReader(payload)
    this.inventories = parseInventories(reader)
    Message.checkFinished(reader)
  }
}

export default InvMessage
