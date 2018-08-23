const {EventEmitter} = require('events')

class Service extends EventEmitter {
  constructor({node, name}) {
    super()
    this.node = node
    this.name = name
  }

  async blockHandler(block, add) {
    return []
  }

  static get dependencies() {
    return []
  }

  get publishEvents() {
    if (!this._subscriptions) {
      return []
    }
    return Object.keys(this._subscriptions).map(name => ({
      name: this.name + '/' + name,
      subscribe: this.subscribe.bind(this, name),
      unsubscribe: this.unsubscribe.bind(this, name),
    }))
  }

  get APIMethods() {
    return {}
  }

  async start() {}

  async stop() {}

  setupRoutes(app) {}

  get routePrefix() {
    return null
  }

  subscribe(name, emitter) {
    let subscription = this._subscriptions[name]
    subscription.push(emitter)
    this.node.log.info(
      emitter.remoteAddress,
      'subscribe:', this.name + '/' + name,
      'total:', subscription.length
    )
  }

  unsubscribe(name, emitter) {
    let subscription = this._subscriptions[name]
    let index = subscription.indexOf(emitter)
    if (index >= 0) {
      subscription.splice(index, 1)
      this.node.log.info(
        emitter.remoteAddress,
        'subscribe:', this.name + '/' + name,
        'total:', subscription.length
      )
    }
  }
}

module.exports = Service
