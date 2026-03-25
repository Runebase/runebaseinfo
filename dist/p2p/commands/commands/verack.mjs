import Message from './message.mjs';
class VerackMessage extends Message {
  constructor(options) {
    super('verack', options);
  }
}
export default VerackMessage;