const dns = require('dns')
const net = require('net')
const {EventEmitter} = require('events')
const runebaseinfo = require('runebaseinfo-lib')
const Peer = require('./peer')
const sha256 = runebaseinfo.crypto.Hash.sha256
const Networks = runebaseinfo.Networks

function now() {
  return Math.floor(Date.now() / 1000)
}

class Pool extends EventEmitter {
  constructor(options = {}) {
    super()
    this.keepalive = false
    this._connectedPeers = new Map()
    this._addrs = []
    this.listenAddr = options.listenAddr !== false
    this.dnsSeed = options.dnsSeed !== false
    this.maxSize = options.maxSize || Pool.MaxConnectedPeers
    this.messages = options.messages
    this.network = Networks.get(options.network) || Networks.defaultNetwork
    this.relay = options.relay !== false

    if (options.addrs) {
      for (let addr of options.addrs) {
        this._addAddr(addr)
      }
    }

    if (this.listenAddr) {
      this.on('peeraddr', (peer, message) => {
        for (let addr of message.addresses) {
          let future = Date.now() + 10 * 60 * 1000
          if (addr.time.getTime() <= 100000000000 || addr.time.getTime() > future) {
            addr.time = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
          }
          this._addAddr(addr)
        }
      })
    }

    this.on('seed', ips => {
      for (let ip of ips) {
        this._addAddr({ip: {v4: ip}})
      }
      if (this.keepalive) {
        this._fillConnections()
      }
    })

    this.on('peerdisconnect', (peer, addr) => {
      this._deprioritizeAddr(addr)
      this._removeConnectedPeer(addr)
      if (this.keepalive) {
        this._fillConnections()
      }
    })
  }

  connect() {
    this.keepalive = true
    if (this.dnsSeed) {
      this._addAddrsFromSeeds()
    } else {
      this._fillConnections()
    }
    return this
  }

  disconnect() {
    this.keepalive = false
    for (let [_, peer] of this._connectedPeers) {
      peer.disconnect()
    }
    return this
  }

  numberConnected() {
    return this._connectedPeers.size
  }

  _fillConnections() {
    for (let addr of this._addrs) {
      if (this.numberConnected() >= this.maxSize) {
        break
      }
      if (!addr.retryTime || now() > addr.retryTime) {
        this._connectPeer(addr)
      }
    }
    return this
  }

  _removeConnectedPeer(addr) {
    if (this._connectedPeers.get(addr.hash).status !== Peer.STATUS.DISCONNECTED) {
      this._connectedPeers.get(addr.hash).disconnect()
    } else {
      this._connectedPeers.delete(addr.hash)
    }
    return this
  }

  _connectPeer(addr) {
    if (!this._connectedPeers.has(addr.hash)) {
      let port = addr.port || this.network.port
      let ip = addr.ip.v4 || addr.ip.v6
      let peer = new Peer({
        host: ip,
        port,
        messages: this.messages,
        network: this.network,
        relay: this.relay
      })
      peer.on('connect', () => this.emit('peerconnect', peer, addr))
      this._addPeerEventHandlers(peer, addr)
      peer.connect()
      this._connectedPeers.set(addr.hash, peer)
    }
    return this
  }

  _addConnectedPeer(socket, addr) {
    if (!this._connectedPeers.has(addr.hash)) {
      let peer = new Peer({
        socket,
        network: this.network,
        messages: this.messages
      })

      this._addPeerEventHandlers(peer, addr)
      this._connectedPeers.set(addr.hash, peer)
      this.emit('peerconnect', peer, addr)
    }
    return this
  }

  _addPeerEventHandlers(peer, addr) {
    peer.on('disconnect', () => this.emit('peerdisconnect', peer, addr))
    peer.on('ready', () => this.emit('peerready', peer, addr))
    for (let event of Pool.PeerEvents) {
      peer.on(event, message => this.emit('peer' + event, peer, message))
    }
  }

  _deprioritizeAddr(addr) {
    let index = this._addrs.findIndex(item => item.hash === addr.hash)
    if (index >= 0) {
      let [item] = this._addrs.splice(index, 1)
      item.retryTime = now() + Pool.RetrySeconds
      this._addrs.push(item)
    }
    return this
  }

  _addAddr(addr) {
    addr.port = addr.port || this.network.port
    addr.hash = sha256(Buffer.from(addr.ip.v6 + addr.ip.v4 + addr.port)).toString('hex')
    let exists = !!this._addrs.find(item => item.hash === addr.hash)
    if (!exists) {
      this._addrs.unshift(addr)
    }
    return addr
  }

  _addAddrsFromSeed(seed) {
    dns.resolve(seed, (err, ips) => {
      if (err) {
        this.emit('seederror', err)
      } else if (!ips || !ips.length) {
        this.emit('seederror', new Error('No IPs found from seed lookup.'))
      } else {
        this.emit('seed', ips)
      }
    })
    return this
  }

  _addAddrsFromSeeds() {
    for (let seed of this.network.dnsSeeds) {
      this._addAddrsFromSeed(seed)
    }
    return this
  }

  inspect() {
    return `<Pool network: ${this.network}, connected: ${this.numberConnected}, available: ${this._addrs.length}>`
  }

  sendMessage(message) {
    for (let [_, peer] of this._connectedPeers) {
      peer.sendMessage(message)
    }
  }

  listen() {
    this.server = net.createServer(socket => {
      let addr = {
        ip: {
          [net.isIPv6(socket.remoteAddress) ? 'v6' : 'v4']: socket.remoteAddress
        },
        port: socket.remotePort
      }
      this._addr(addr)
      this._addConnectedPeer(socket, addr)
    })
    this.server.listen(this.network.port)
  }
}

Pool.MaxConnectedPeers = 8
Pool.RetrySeconds = 30
Pool.PeerEvents = [
  'version', 'inv', 'getdata', 'ping', 'pong', 'addr',
  'getaddr', 'verack', 'reject', 'alert', 'headers', 'block', 'merkleblock',
  'tx', 'getblocks', 'getheaders', 'error', 'filterload', 'filteradd',
  'filterclear', 'sendheaders', 'sendcmpct'
]

module.exports = Pool
