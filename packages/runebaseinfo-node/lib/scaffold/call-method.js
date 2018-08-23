const {promisify} = require('util')
const socketClient = require('socket.io-client')

function callMethod({host, protocol, port}, method, params, done) {
  let url = `${protocol}://${host}:${port}`
  let socketOptions = {
    reconnection: false,
    connect_timeout: 5000
  }
  let socket = socketClient(url, socketOptions)

  socket.on('connect', () => {
    socket.send({method, params}, response => {
      if (response.error) {
        return done(new Error(response.error.message))
      }
      socket.close()
      done(null, response.result)
    })
  })

  socket.on('connect_error', done)

  return socket
}

exports = module.exports = promisify(callMethod)
exports.originalFunction = callMethod
