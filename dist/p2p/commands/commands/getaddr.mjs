import Message from './message.mjs';
class GetAddrMessage extends Message {
  constructor(options) {
    super('getaddr', options);
  }
}
export default GetAddrMessage;