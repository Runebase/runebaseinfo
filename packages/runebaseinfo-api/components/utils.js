class ErrorResponse {
  constructor({log}) {
    this.log = log
  }

  notReady(ctx, percentage) {
    ctx.throw(503, 'Server not yet ready. Sync percentage: ' + percentage)
  }

  handleErrors(ctx, err) {
    if (err.status) {
      throw err
    }
    if (err.code) {
      ctx.throw(500, err.message + '. Code: ' + err.code)
    } else {
      this.log.error(err.stack)
      ctx.throw(500, err.message)
    }
  }
}


exports.ErrorResponse = ErrorResponse
