const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')
const {sha256sha256} = runebaseinfo.crypto.Hash

const MINIMUM_LENGTH = 20
const PAYLOAD_START = 16

class Messages {
  constructor(options = {}) {
    this.builder = Messages.builder(options)
    for (let [key, name] of Object.entries(this.builder.commandsMap)) {
      this[name] = this.builder.commands[key]
    }
    this.network = options.network || runebaseinfo.Networks.defaultNetwork
  }

  parseBuffer(dataBuffer) {
    if (dataBuffer.length < MINIMUM_LENGTH) {
      return
    } else if (!this._discardUntilNextMessage(dataBuffer)) {
      return
    }

    let payloadLength = dataBuffer.get(PAYLOAD_START)
      | dataBuffer.get(PAYLOAD_START + 1) << 8
      | dataBuffer.get(PAYLOAD_START + 2) << 16
      | dataBuffer.get(PAYLOAD_START + 3) << 24

    let messageLength = payloadLength + 24
    if (dataBuffer.length < messageLength) {
      return
    }

    let command = dataBuffer.slice(4, 16).toString('ascii').replace(/\0+$/, '')
    let payload = dataBuffer.slice(24, messageLength)
    let checksum = dataBuffer.slice(20, 24)
    let checksumConfirm = sha256sha256(payload).slice(0, 4)

    if (Buffer.compare(checksumConfirm, checksum) !== 0) {
      dataBuffer.skip(messageLength)
      return
    } else {
      dataBuffer.skip(messageLength)
      return this._buildFromBuffer(command, payload)
    }
  }

  _discardUntilNextMessage(dataBuffer) {
    assert(this.network, 'network must be set')
    for (let i = 0; ; ++i) {
      let packageNumber = dataBuffer.slice(0, 4).toString('hex')
      if (packageNumber === this.network.networkMagic.toString('hex')) {
        dataBuffer.skip(i)
        return true
      } else if (i > dataBuffer.length - 4) {
        dataBuffer.skip(i)
        return false
      }
    }
  }

  _buildFromBuffer(command, payload) {
    if (!(command in this.builder.commands)) {
      throw new Error('Unsupported message command: ' + command)
    }
    return this.builder.commands[command].fromBuffer(payload)
  }

  add(key, name, Command) {
    this.builder.add(key, Command)
    this[name] = this.buidler.commands[key]
  }
}

exports = module.exports = Messages
exports.Message = require('./message')
exports.builder = require('./builder')
