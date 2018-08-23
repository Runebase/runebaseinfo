const Message = require('../message')

class FilterclearMessage extends Message {
  constructor(arg, options) {
    super('filterclear', options)
  }
}

module.exports = FilterclearMessage
