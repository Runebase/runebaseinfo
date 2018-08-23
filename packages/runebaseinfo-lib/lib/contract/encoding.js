const ABI = require('ethereumjs-abi')

function encode(types, params) {
  return ABI.rawEncode(types, params)
}

function decode(types, data) {
  return ABI.rawDecode(types, data)
}

function methodID(name, types) {
  return ABI.methodID(name, types)
}

function eventID(name, types) {
  return ABI.eventID(name, types)
}

function getAbiInputTypes(abi) {
  let result = []
  for (let input of abi.inputs) {
    if (input.type === 'tuple') {
      result.push('(' + getAbiInputTypes({inputs: input.components}).join(',') + ')')
    } else {
      result.push(input.type)
    }
  }
  return result
}

exports.encode = encode
exports.decode = decode
exports.methodID = methodID
exports.eventID = eventID
exports.getAbiInputTypes = getAbiInputTypes
