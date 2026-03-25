import Message from './message.mjs'

class SendHeadersMessage extends Message {
  constructor(options) {
    super('sendheaders', options)
  }
}

export default SendHeadersMessage
