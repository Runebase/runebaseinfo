const BN = require('./bn')
const EC = require('elliptic').ec
const ec = new EC('secp256k1')
const ecPoint = ec.curve.point.bind(ec.curve)
const ecPointFromX = ec.curve.pointFromX.bind(ec.curve)

function Point(x, y, isRed) {
  let point = ecPoint(x, y, isRed)
  point.validate()
  return point
}

Point.prototype = Object.getPrototypeOf(ec.curve.point())

Point.fromX = function(odd, x) {
  let point
  try {
    point = ecPointFromX(x, odd)
  } catch (err) {
    throw new Error('Invalid X')
  }
  point.validate()
  return point
}

Point.getG = function() {
  return ec.curve.g
}

Point.getN = function() {
  return new BN(ec.curve.n.toArray())
}

Point.prototype._getX = Point.prototype.getX

Point.prototype.getX = function() {
  return new BN(this._getX().toArray())
}

Point.prototype._getY = Point.prototype.getY

Point.prototype.getY = function() {
  return new BN(this._getY().toArray())
}

Point.prototype.validate = function() {
  if (this.isInfinity()) {
    throw new Error('Point cannot be equal to Infinity')
  }

  let p2
  try {
    p2 = ecPointFromX(this.getX(), this.getY().isOdd())
  } catch (err) {
    throw new Error('Point does not lie on the curve')
  }

  if (p2.y.cmp(this.y) !== 0) {
    throw new Error('Invalid y value for curve.')
  }

  if (!(this.mul(Point.getN()).isInfinity())) {
    throw new Error('Point times N must be infinity')
  }

  return this;
}

Point.pointToCompressed = function(point) {
  let xbuf = point.getX().toBuffer({size: 32})
  let ybuf = point.getY().toBuffer({size: 32})

  let prefix
  if (ybuf[ybuf.length - 1] & 1) {
    prefix = Buffer.from([0x03])
  } else {
    prefix = Buffer.from([0x02])
  }
  return Buffer.concat([prefix, xbuf])
}

module.exports = Point
