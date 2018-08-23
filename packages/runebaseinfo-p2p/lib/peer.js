const {EventEmitter} = require('events')
const {Socket} = require('net')
const Socks5Client = require('socks5-client')
const runebaseinfo = require('runebaseinfo-lib')
const Buffers = require('./buffers')
const Messages = require('./messages')
const Networks = runebaseinfo.Networks

const MAX_RECEIVE_BUFFER = 10000000
const STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  READY: 'ready'
}

class Peer extends EventEmitter {
  constructor(options) {
    super()
    if (options.socket) {
      this.socket = options.socket
      this.host = this.socket.remoteAddress
      this.port = this.socket.remotePort
      this.status = STATUS.CONNECTED
      this._addSocketEventHandlers()
    } else {
      this.host = options.host || 'localhost'
      this.status = STATUS.DISCONNECTED
      this.port = options.port
    }

    this.network = Networks.get(options.network) || Networks.defaultNetwork
    this.port = this.port || this.network.port

    this.messages = options.messages || new Messages({
      network: this.network,
      Block: runebaseinfo.Block,
      Transaction: runebaseinfo.Transaction
    })

    this.dataBuffer = new Buffers()
    this.version = 0
    this.bestHeight = 0
    this.subversion = null
    this.relay = options.relay !== false
    this.versionSent = false

    this.on('verack', () => {
      this.status = STATUS.READY
      this.emit('ready')
    })

    this.on('version', message => {
      this.version = message.version
      this.subversion = message.subversion
      this.bestHeight = message.startHeight
      let verackResponse = this.messages.VerAck()
      this.sendMessage(verackResponse)
      if (!this.versionSent) {
        this._sendVersion()
      }
    })

    this.on('ping', message => this._sendPong(message.nonce))
  }

  setProxy(host, port) {
    assert(this.status === STATUS.DISCONNECTED)
    this.proxy = {host, port}
    return this
  }

  connect() {
    this.socket = this._getSocket()
    this.status = STATUS.CONNECTING

    this.socket.on('connect', () => {
      this.status = STATUS.CONNECTED
      this.emit('connect')
      this._sendVersion()
    })

    this._addSocketEventHandlers()
    this.socket.connect(this.port, this.host)
    return this
  }

  _addSocketEventHandlers() {
    this.socket.on('error', this._onError.bind(this))
    this.socket.on('end', this.disconnect.bind(this))

    this.socket.on('data', data => {
      this.dataBuffer.push(data)
      if (this.dataBuffer.length > MAX_RECEIVE_BUFFER) {
        this.disconnect()
      } else {
        this._readMessage()
      }
    })
  }

  _onError(err) {
    this.emit('error', err)
    if (this.status !== STATUS.DISCONNECTED) {
      this.disconnect()
    }
  }

  disconnect() {
    this.status = STATUS.DISCONNECTED
    this.socket.destroy()
    this.emit('disconnect')
    return this
  }

  sendMessage(message) {
    this.socket.write(message.toBuffer())
  }

  _sendVersion() {
    let message = this.messages.Version({relay: this.relay})
    this.versionSent = true
    this.sendMessage(message)
  }

  _sendPong(nonce) {
    let message = this.messages.Pong(nonce)
    this.sendMessage(message)
  }

  _readMessage() {
    let message = this.messages.parseBuffer(this.dataBuffer)
    if (message) {
      this.emit(message.command, message)
      this._readMessage()
    }
  }

  _getSocket() {
    if (this.proxy) {
      return new Socks5Client(this.proxy.host, this.proxy.port)
    } else {
      return new Socket()
    }
  }
}

exports = module.exports = Peer
exports.STATUS = STATUS
