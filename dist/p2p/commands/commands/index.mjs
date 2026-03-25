import AddrMessage from './addr.mjs';
import BlockMessage from './block.mjs';
import FeeFilterMessage from './feefilter.mjs';
import GetAddrMessage from './getaddr.mjs';
import GetBlocksMessage from './getblocks.mjs';
import GetDataMessage from './getdata.mjs';
import GetHeadersMessage from './getheaders.mjs';
import HeadersMessage from './headers.mjs';
import InvMessage from './inv.mjs';
import MempoolMessage from './mempool.mjs';
import PingMessage from './ping.mjs';
import PongMessage from './pong.mjs';
import RejectMessage from './reject.mjs';
import SendCmpctMessage from './sendcmpct.mjs';
import SendHeadersMessage from './sendheaders.mjs';
import TxMessage from './tx.mjs';
import VerackMessage from './verack.mjs';
import VersionMessage from './version.mjs';
const messageMap = {
  addr: AddrMessage,
  block: BlockMessage,
  feefilter: FeeFilterMessage,
  getaddr: GetAddrMessage,
  getblocks: GetBlocksMessage,
  getdata: GetDataMessage,
  getheaders: GetHeadersMessage,
  headers: HeadersMessage,
  inv: InvMessage,
  mempool: MempoolMessage,
  ping: PingMessage,
  pong: PongMessage,
  reject: RejectMessage,
  sendcmpct: SendCmpctMessage,
  sendheaders: SendHeadersMessage,
  tx: TxMessage,
  verack: VerackMessage,
  version: VersionMessage
};
export default messageMap;