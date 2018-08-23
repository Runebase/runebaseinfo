const createError = require('errno').create
const RunebaseinfoNodeError = createError('RunebaseinfoNodeError')
const RPCError = createError('RPCError', RunebaseinfoNodeError)

exports.Error = RunebaseinfoNodeError
exports.RPCError = RPCError
