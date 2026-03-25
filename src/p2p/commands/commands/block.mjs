import {Block} from '../../../lib/index.mjs'
import Message from './message.mjs'

class BlockMessage extends Message {
  constructor({block, ...options}) {
    super('block', options)
    this.block = block
  }

  get payload() {
    return this.block.toBuffer()
  }

  set payload(payload) {
    this.block = Block.fromBuffer(payload)
  }
}

export default BlockMessage
