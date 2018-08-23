exports.version = 'v' + require('./package.json').version
exports.versionGuard = function(version) {
  if (version !== undefined) {
    console.log(
      'More than one instance of runebaseinfo-lib found.',
      'Please make sure to require runebaseinfo-lib and',
      'check that submodules do not also include their own runebaseinfo-lib dependency.'
    )
  }
}
exports.versionGuard(global._runebaseinfo)
global._runebaseinfo = exports.version

exports.crypto = {
  BN: require('./lib/crypto/bn'),
  ECDSA: require('./lib/crypto/ecdsa'),
  Hash: require('./lib/crypto/hash'),
  Random: require('./lib/crypto/random'),
  Point: require('./lib/crypto/point'),
  Signature: require('./lib/crypto/signature')
}

exports.encoding = {
  Base58: require('./lib/encoding/base58'),
  Base58Check: require('./lib/encoding/base58check'),
  BufferReader: require('./lib/encoding/bufferreader'),
  BufferWriter: require('./lib/encoding/bufferwriter'),
  Varint: require('./lib/encoding/varint'),
  SegwitAddress: require('./lib/encoding/segwit-address')
}

exports.util = {
  buffer: require('./lib/util/buffer'),
  js: require('./lib/util/js'),
  preconditions: require('./lib/util/preconditions')
}

exports.errors = require('./lib/errors')

exports.Address = require('./lib/address')
exports.Block = require('./lib/block')
exports.MerkleBlock = require('./lib/block/merkleblock')
exports.BlockHeader = require('./lib/block/blockheader')
exports.HDPrivateKey = require('./lib/hdprivatekey.js')
exports.HDPublicKey = require('./lib/hdpublickey.js')
exports.Networks = require('./lib/networks')
exports.Opcode = require('./lib/opcode')
exports.PrivateKey = require('./lib/privatekey')
exports.PublicKey = require('./lib/publickey')
exports.Script = require('./lib/script')
exports.Transaction = require('./lib/transaction')
exports.URI = require('./lib/uri')
exports.Unit = require('./lib/unit')
exports.contract = require('./lib/contract')

exports.deps = {
  bnjs: require('bn.js'),
  bs58: require('bs58'),
  elliptic: require('elliptic'),
  _: require('lodash')
}

exports.Transaction.sighash = require('./lib/transaction/sighash')
