const BaseService = require('../service')

class FeeService extends BaseService {
  constructor(options) {
    super(options)
    this._client = this.node.getRpcClient()
  }

  static get dependencies() {
    return ['db']
  }

  get APIMethods() {
    return {
      estimateFee: this.estimateFee.bind(this)
    }
  }

  estimateFee(blocks) {
    return this._client.estimateFee(blocks || 4)
  }
}

module.exports = FeeService
