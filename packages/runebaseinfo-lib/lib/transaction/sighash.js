const assert = require('assert')
const Signature = require('../crypto/signature')
const Script = require('../script')
const Output = require('./output')
const BufferReader = require('../encoding/bufferreader')
const BufferWriter = require('../encoding/bufferwriter')
const BN = require('../crypto/bn')
const {sha256sha256} = require('../crypto/hash')
const ECDSA = require('../crypto/ecdsa')

const SIGHASH_SINGLE_BUG = '0'.repeat(63) + '1'
const BITS_64_ON = 'f'.repeat(16)

function sighash(transaction, sighashType, inputNumber, subscript) {
  const Transaction = require('./transaction')
  const Input = require('./input')

  let txcopy = Transaction.shallowCopy(transaction)
  subscript = new Script(subscript)
  subscript.removeCodeseparators()
  for (let i = 0; i < txcopy.inputs.length; ++i) {
    txcopy.inputs[i] = new Input(txcopy.inputs[i]).setScript(Script.empty())
  }
  txcopy.inputs[inputNumber] = new Input(txcopy.inputs[inputNumber]).setScript(subscript)
  if ([Signature.SIGHASH_NONE, Signature.SIGHASH_SINGLE].includes(sighashType & 0x1f)) {
    for (let i = 0; i < txcopy.inputs.length; ++i) {
      if (i !== inputNumber) {
        txcopy.inputs[i].sequenceNumber = 0
      }
    }
  }

  if ((sighashType & 0x1f) === Signature.SIGHASH_NONE) {
    txcopy.outputs = []
  } else if ((sighashType & 0x1f) === Signature.SIGHASH_SINGLE) {
    if (inputNumber >= txcopy.outputs.length) {
      return Buffer.from(Signature.SIGHASH_SINGLE_BUG, 'hex')
    }
    txcopy.outputs.length = inputNumber + 1
    for (let i = 0; i < inputNumber; ++i) {
      txcopy.outputs[i] = new Output({
        satoshis: BN.fromBuffer(Buffer.from(BITS_64_ON, 'hex')),
        script: Script.empty()
      })
    }
  }

  if (sighashType & Signature.SIGHASH_ANYONECANPAY) {
    txcopy.inputs = [txcopy.inputs[inputNumber]]
  }

  let buf = new BufferWriter().write(txcopy.toBuffer()).writeInt32LE(sighashType).toBuffer()
  return new BufferReader(sha256sha256(buf)).readReverse()
}

function sign(transaction, privateKey, sighashType, inputIndex, subscript) {
  let hashbuf = sighash(transaction, sighashType, inputIndex, subscript)
  return ECDSA.sign(hashbuf, privateKey, 'little').set({nhashtype: sighashType})
}

function verify(transaction, signature, publicKey, inputIndex, subscript) {
  assert(transaction !== undefined)
  assert(signature !== undefined && 'nhashtype' in signature)
  let hashbuf = sighash(transaction, signature.nhashtype, inputIndex, subscript)
  return ECDSA.verify(hashbuf, signature, publicKey, 'little')
}

exports.sighash = sighash
exports.sign = sign
exports.verify = verify
