const runebaseinfo = require('runebaseinfo-lib')
const Message = require('../message')
const {getNonce, parseIP, writeAddr} = require('../utils')
const {BufferReader, BufferWriter} = runebaseinfo.encoding
const {BN} = runebaseinfo.crypto
const packageInfo = require('../../../package.json')

class VersionMessage extends Message {
  constructor(arg, options) {
    super('version', options)
    arg = arg || {}
    this.version = arg.version || options.protocolVersion
    this.nonce = arg.nonce || getNonce()
    this.services = arg.services || new BN(13)
    this.timestamp = arg.timestamp || new Date()
    this.subversion = arg.subversion || `/runebaseinfo:${packageInfo.version}/`
    this.startHeight = arg.startHeight || 0
    this.relay = arg.relay !== false
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    this.version = parser.readUInt32LE()
    this.services = parser.readUInt64LEBN()
    this.timestamp = new Date(parser.readUInt64LEBN().toNumber() * 1000)

    this.addrMe = {}
    this.addrMe.services = parser.readUInt64LEBN()
    this.addrMe.ip = parseIP(parser)
    this.addrMe.port = parser.readUInt16BE()
    this.addrYou = {}
    this.addrYou.services = parser.readUInt64LEBN()
    this.addrYou.ip = parseIP(parser)
    this.addrYou.port = parser.readUInt16BE()

    this.nonce = parser.read(8)
    this.subversion = parser.readVarLengthBuffer().toString()
    this.startHeight = parser.readUInt32LE()
    this.relay = parser.finished() ? true : !!parser.readUInt8()
    Message.checkFinished(parser)
  }

  getPayload() {
    let bw = new BufferWriter()
    bw.writeUInt32LE(this.version)
    bw.writeUInt64LEBN(this.services)

    let timestampBuffer = Buffer.alloc(8)
    timestampBuffer.writeUInt32LE(Math.round(this.timestamp.getTime() / 1000), 0)
    bw.write(timestampBuffer)

    writeAddr(this.addrMe, bw)
    writeAddr(this.addrYou, bw)
    bw.write(this.nonce)
    bw.writeVarintNum(this.subversion.length)
    bw.write(new Buffer(this.subversion, 'ascii'))
    bw.writeUInt32LE(this.startHeight)
    bw.writeUInt8(this.relay)

    return bw.concat()
  }
}

module.exports = VersionMessage
