const fs = require('fs')
const http = require('http')
const https = require('https')
const Koa = require('koa')
const bodyparser = require('koa-bodyparser')
const mount = require('koa-mount')
const socketio = require('socket.io')
const BaseService = require('../service')

const DEFAULT_SOCKET_RPC = true

class WebService extends BaseService {
  constructor(options) {
    super({node: options.node, name: "web"})
    this.https = options.https || this.node.https
    this.httpsOptions = options.httpsOptions || this.node.httpsOptions
    this.port = options.port || this.node.port || 3456
    this.jsonRequestLimit = options.jsonRequestLimit || '100kb'
    this.enableSocketRPC = "enableSocketRPC" in options ? options.enableSocketRPC : DEFAULT_SOCKET_RPC

    this.node.on('ready', () => {
      this.eventNames = this.getEventNames()
      this.setupAllRoutes()
      this.server.listen(this.port)
      this.createMethodsMap()
    })
  }

  async start() {
    this.app = new Koa()
    this.app.use(bodyparser({jsonLimit: this.jsonRequestLimit}))

    if (this.https) {
      this.transformHttpsOptions()
      this.server = https.createServer(this.httpsOptions, this.app.callback())
    } else {
      this.server = http.createServer(this.app.callback())
    }

    this.io = socketio.listen(this.server)
    this.io.on('connection', this.socketHandler.bind(this))
  }

  async stop() {
    if (this.server) {
      this.server.close()
    }
  }

  setupAllRoutes() {
    for (let [name, service] of this.node.services) {
      if (service.routePrefix != null) {
        let subApp = new Koa()
        this.app.use(mount('/' + service.routePrefix, subApp))
        service.setupRoutes(subApp)
      }
    }
  }

  createMethodsMap() {
    this.methods = this.node.getAllAPIMethods()
  }

  getEventNames() {
    let events = this.node.getAllPublishEvents()
    let eventNames = new Set()

    function addEventName(name) {
      if (eventNames.has(name)) {
        throw new Error('Duplicate event', name)
      }
      eventNames.add(name)
    }

    for (let event of events) {
      addEventName(event.name)

      if (event.extraEvents) {
        for (let name of event.extraEvents) {
          addEventName(name)
        }
      }
    }

    return eventNames
  }

  static getRemoteAddress(socket) {
    return socket.client.request.headers['cf-connecting-ip'] || socket.conn.removeAddress
  }

  socketHandler(socket) {
    let removeAddress = WebService.getRemoteAddress()
    let bus = this.node.openBus({remoteAddress})

    if (this.enableSocketRPC) {
      socket.on('message', this.socketMessageHandler.bind(this))
    }

    socket.on('subscribe', (name, params) => {
      log.info(remoteAddress, 'web socket subscribe:', name)
      bus.subscribe(name, params)
    })

    socket.on('unsubscribe', (name, params) => {
      log.info(remoteAddress, 'web socket unsubscribe:', name)
      bus.unsubscribe(name, params)
    })

    for (let eventName of this.eventNames) {
      bus.on(eventName, ...args => {
        if (socket.connected) {
          socket.emit(eventName, ...args)
        }
      })
    }

    socket.on('disconnect', () => {
      log.info(remoteAddress, 'web socket disconnect')
      bus.close()
    })
  }

  socketMessageHandler({method, params = []}, socketCallback) {
    if (method in this.methods) {
      this.methods[method](...params).then(
        result => socketCallback({result}),
        err => socketCallback({message: err.toString()})
      )
    } else {
      socketCallback({
        error: {message: 'Method not found'}
      })
    }
  }

  transformHttpsOptions() {
    if (!this.httpsOptions || !this.httpsOptions.key || !this.httpsOptions.cert) {
      throw new Error('missing https options')
    }

    this.httpsOptions = {
      key: fs.readFileSync(this.httpsOptions.key),
      cert: fs.readFileSync(this.httpsOptions.cert)
    }
  }
}

module.exports = WebService
