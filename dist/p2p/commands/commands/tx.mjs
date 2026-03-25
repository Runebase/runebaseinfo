import { Transaction } from '../../../lib/index.mjs';
import Message from './message.mjs';
class TxMessage extends Message {
  constructor({
    transaction,
    ...options
  }) {
    super('tx', options);
    this.transaction = transaction;
  }
  get payload() {
    return this.block.toBuffer();
  }
  set payload(payload) {
    this.transaction = Transaction.fromBuffer(payload);
  }
}
export default TxMessage;