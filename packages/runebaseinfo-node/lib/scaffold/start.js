const path = require('path')
const fs = require('fs')
const RunebaseinfoNode = require('../node')

let shuttingDown = false

function loadModule(req, service) {
  try {
    service.module = req(path.resolve(__dirname, '../services/' + service.name))
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      throw err
    }
    let servicePackage = req(service.name + '/package')
    let serviceModule = service.name
    if (servicePackage.runebaseinfoNode) {
      serviceModule += '/' + servicePackage.runebaseinfoNode
    }
    service.module = req(serviceModule)
  }
}

function setupServices(req, servicesPath, {services, servicesConfig}) {
  module.paths.push(path.resolve(servicesPath, './node_modules'))

  if (services) {
    return services.map(serviceName => {
      let service = {name: serviceName}
      let hasConfig = servicesConfig && servicesConfig[service.name]
      service.config = hasConfig ? servicesConfig[service.name] : {}
      loadModule(req, service)
      return service
    })
  } else {
    return []
  }
}

function cleanShutdown(_process, node) {
  node.stop().then(
    () => {
      node.log.info('Halted')
      _process.exit(0)
    },
    err => {
      node.log.error('Failed to stop services:', err)
      return _process.exit(1)
    }
  )
}

function exitHandler(options, _process, node, err) {
  if (err) {
    node.log.error('uncaught exception:', err)
    if (err.stack) {
      node.log.error(err.stack)
    }
    node.stop().then(
      () => _process.exit(-1),
      err => node.log.error('Failed to stop services:', err)
    )
  }
  if (options.sigint && !shuttingDown) {
    shuttingDown = true
    cleanShutdown(_process, node)
  }
}

function registerExitHandlers(_process, node) {
  _process.on('uncaughtException', exitHandler.bind(null, {exit: true}, _process, node))
  _process.on('SIGINT', exitHandler.bind(null, {sigint: true}, _process, node))
}

function start(options) {
  let fullConfig = Object.assign({}, options.config)
  let servicesPath = options.servicePath || options.path
  fullConfig.path = path.resolve(options.path, './runebaseinfo-node.json')
  fullConfig.services = setupServices(require, servicesPath, options.config)

  let node = new RunebaseinfoNode(fullConfig)
  registerExitHandlers(process, node)
  node.on('ready', () => node.log.info('Runebaseinfo Node ready'))
  node.on('error', err => node.log.error(err))

  node.start().catch(err => {
    node.log.error('Failed to start services')
    if (err.stack) {
      node.log.error(err.stack)
    }
    cleanShutdown(process, node)
  })

  return node
}

exports = module.exports = start
Object.assign(exports, {
  registerExitHandlers,
  exitHandler,
  setupServices,
  cleanShutdown
})
