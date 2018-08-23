const assert = require('assert')
const {EventEmitter} = require('events')
const {Logger} = require('.')
const Bus = require('./bus')
const errors = require('./errors')

class Node extends EventEmitter {
  constructor(config) {
    super()
    this.configPath = config.path
    this.errors = errors
    this.log = new Logger({formatting: config.formatLogs})
    this.datadir = config.datadir
    this.network = config.network
    this.services = new Map()
    this._unloadedServices = config.services || []
    this.port = config.port
    this.https = config.https
    this.httpsOptions = config.httpsOptions
  }

  openBus({remoteAddress} = {}) {
    return new Bus({node: this, remoteAddress})
  }

  getAllAPIMethods() {
    let methods = {}
    for (let service of this.services.values()) {
      Object.assign(methods, service.APIMethods)
    }
    return methods
  }

  getAllPublishEvents() {
    let methods = []
    for (let service of this.services.values()) {
      methods.push(...service.publishEvents)
    }
    return methods
  }

  static getServiceOrder(services) {
    let names = []
    let servicesByName = {}
    for (let service of services) {
      names.push(service.name)
      servicesByName[service.name] = service
    }

    let stack = []
    let stackNames = new Set()

    function addToStack(names) {
      for (let name of names) {
        let service = servicesByName[name]
        addToStack(service.module.dependencies)
        if (!stackNames.has(name)) {
          stack.push(service)
          stackNames.add(name)
        }
      }
    }

    addToStack(names)
    return stack
  }

  getServicesByOrder() {
    let names = []
    let servicesByName = {}
    for (let [name, service] of this.services) {
      names.push(name)
      servicesByName[name] = service
    }

    let stack = []
    let stackNames = new Set()

    function addToStack(names) {
      for (let name of names) {
        let service = servicesByName[name]
        addToStack(service.constructor.dependencies)
        if (!stackNames.has(name)) {
          stack.push(service)
          stackNames.add(name)
        }
      }
    }

    addToStack(names)
    return stack
  }

  async _startService(serviceInfo) {
    this.log.info('Starting', serviceInfo.name)

    let config
    if (serviceInfo.config) {
      assert(!serviceInfo.config.node)
      assert(!serviceInfo.config.name)
      config = serviceInfo.config
    } else {
      config = {}
    }

    config.node = this
    config.name = serviceInfo.name
    let service = new serviceInfo.module(config)
    this.services.set(serviceInfo.name, service)
    await service.start()

    let methodNameConflicts = []
    for (let [name, method] of Object.entries(service.APIMethods)) {
      if (name in this) {
        methodNameConflicts.push(name)
      } else {
        this[name] = method
      }
    }

    if (methodNameConflicts.length > 0) {
      throw new Error('Existing API method(s) exists: ' + methodNameConflicts.join(', '))
    }
  }

  _logTitle() {
    if (this.configPath) {
      this.log.info('Using config:', this.configPath)
      this.log.info('Using network:', this.network)
    }
  }

  async start(callback) {
    let services = this._unloadedServices
    let servicesOrder = Node.getServiceOrder(services)
    this._logTitle()
    for (let service of servicesOrder) {
      await this._startService(service)
    }
    this.emit('ready')
  }

  async stop(callback) {
    this.log.info('Beginning shutdown')
    let services = Node.getServiceOrder(this._unloadedServices).reverse()
    this.stopping = true
    this.emit('stopping')

    for (let service of services) {
      if (this.services.has(service.name)) {
        this.log.info('Stopping', service.name)
        await this.services.get(service.name).stop()
      } else {
        this.log.info('Stopping', service.name, '(not started)')
      }
    }
  }
}

module.exports = Node
