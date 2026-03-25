import Message from './message.mjs'

class MempoolMessage extends Message {
  constructor(options) {
    super('mempool', options)
  }
}

export default MempoolMessage
