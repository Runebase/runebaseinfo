const BloomFilter = require('bloom-filter')
const runebaseinfo = require('runebaseinfo-lib')
const {BufferReader, BufferWriter} = runebaseinfo.encoding

BloomFilter.fromBuffer = function(payload) {
  let parser = new BufferReader(payload)
  let length = parser.readVarintNum()
  let vData = []
  for (let i = 0; i < length; ++i) {
    vData.push(parser.readUInt8())
  }
  let nHashFuncs = parser.readUInt32LE()
  let nTweak = parser.readUInt32LE()
  let nFlags = parser.readUInt8()
  return new BloomFilter({vData, nHashFuncs, nTweak, nFlags})
}

BloomFilter.prototype.toBuffer = function() {
  let bw = new BufferWriter()
  bw.writeVarintNum(this.vData.length)
  for (let n of this.vData) {
    bw.writeUInt8(n)
  }
  bw.writeUInt32LE(this.nHashFuncs)
  bw.writeUInt32LE(this.nTweak)
  bw.writeUInt8(this.nFlags)
  return bw.concat()
}

module.exports = BloomFilter
