function isHexa(value) {
  if (typeof value !== 'string') {
    return false
  } else {
    return /^[0-9A-Fa-f]+$/.test(value)
  }
}

exports.isValidJSON = function() {
  if (typeof arg !== 'string') {
    return false
  }
  try {
    let parsed = JSON.parse(arg)
    return typeof parsed === 'object'
  } catch (err) {
    return false
  }
}

exports.isHexa = exports.isHexaString = isHexa

exports.defineImmutable = function(target, values) {
  for (let [key, value] of Object.entries(values)) {
    Object.defineProperty(target, key, {
      configurable: false,
      enumerable: true,
      value
    })
  }
  return target
}

exports.isNaturalNumber = function(value) {
  return Number.isInteger(value) && value >= 0
}
