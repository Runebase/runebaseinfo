const assert = require('assert')
const runebaseinfo = require('runebaseinfo-lib')

function checkInventory(arg) {
  assert(
    arg === undefined || Array.isArray(arg),
    'Argument is expected to be an array of inventory objects'
  )
}

function getNonce() {
  return runebaseinfo.crypto.Random.getRandomBuffer(8)
}

function writeIP(ip, bw) {
  let words = ip.v6.split(':')
  for (let word of words) {
    bw.write(Buffer.from(word, 'hex'))
  }
}

function writeAddr(addr, bw) {
  if (addr === undefined) {
    bw.write(Buffer.alloc(26))
  } else {
    bw.writeUInt64LEBN(addr.services)
    writeIP(addr.ip, bw)
    bw.writeUInt16BE(addr.port)
  }
}

function writeInventory(inventory, bw) {
  bw.writeVarintNum(inventory.length)
  for (let {type, hash} of inventory) {
    bw.writeUInt32LE(type)
    bw.write(hash)
  }
}

function parseIP(parser) {
  let ipv6 = []
  let ipv4 = []
  for (let i = 0; i < 8; ++i) {
    word = parser.read(2)
    ipv6.push(word.toString('hex'))
    if (i >= 6) {
      ipv4.push(word[0], word[1])
    }
  }
  return {
    v6: ipv6.join(':'),
  }
}

function parseAddr(parser) {
  let services = parser.readUInt64LEBN()
  let ip = parseIP(parser)
  let port = parser.readUInt16BE()
  return {services, ip, port}
}

function sanitizeStartStop(obj) {
  let {starts, stop} = obj

  assert(starts === undefined || Array.isArray(starts))
  if (starts) {
    for (let i = 0; i < starts.length; ++i) {
      if (typeof starts[i] === 'string') {
        starts[i] = Buffer.from(starts[i], 'hex').reverse()
      }
      if (starts[i].length !== 32) {
        throw new Error(`Invalid hash ${i} length: ${starts[i].length}`)
      }
    }
  } else {
    starts = []
  }

  if (typeof stop === 'string') {
    stop = Buffer.from(stop, 'hex').reverse()
  }
  if (!stop) {
    stop = Buffer.alloc(32)
  }

  return Object.assign(obj, {starts, stop})
}

Object.assign(exports, {
  checkInventory, getNonce, writeIP, writeAddr, writeInventory, parseIP, parseAddr, sanitizeStartStop
})
