class Buffers {
  constructor(buffers = []) {
    this.buffers = buffers
    this.length = this.buffers.reduce((size, buffer) => size + buffer.length, 0)
  }

  push(...buffers) {
    for (let buffer of buffers) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('Tried to push a non-buffer')
      }
    }

    this.buffers.push(...buffers)
    this.length += buffers.reduce((size, buffer) => size + buffer.length, 0)
    return this.length
  }

  copy(dest, dStart, start, end) {
    return this.slice(start, end).copy(dest, dStart, 0, end - start)
  }

  slice(i, j) {
    if (i === undefined) {
      i = 0
    }
    if (j === undefined || j > this.length) {
      j = this.length
    }

    let startBytes = 0
    let offset = 0
    while (offset < this.buffers.length && startBytes + this.buffers[offset].length <= i) {
      startBytes += this.buffers[offset++].length
    }

    let target = Buffer.alloc(j - i)
    for (let t = 0; t < j - i && offset < this.buffers.length; ++offset) {
      let length = this.buffers[offset].length
      let start = t === 0 ? i - startBytes : 0
      let end = Math.min(start + j - i - t, length)
      this.buffers[offset].copy(target, t, start, end)
      t += end - start
    }

    return target
  }

  pos(index) {
    if (index < 0 || index >= this.length) {
      throw new Error('Index out of bounds')
    }
    for (let offset = 0, l = index; ; ++offset) {
      let buffer = this.buffers[offset]
      if (l < buffer.length) {
        return {index: offset, offset: l}
      } else {
        l -= buffer.length
      }
    }
  }

  get(index) {
    let pos = this.pos(index)
    return this.buffers[pos.index][pos.offset]
  }

  set(index, buffer) {
    let pos = this.pos(index)
    return this.buffers[pos.index].set(pos.offset, buffer)
  }

  toBuffer() {
    return this.slice()
  }

  toString(encoding, start, end) {
    return this.slice(start, end).toString(encoding)
  }

  skip(index) {
    if (index === 0) {
      return
    } else if (index >= this.length) {
      this.buffers = []
      this.length = 0
      return
    }

    let pos = this.pos(index)
    this.buffers.splice(0, pos.index)
    this.buffers[0] = Buffer.from(this.buffers[0].slice(pos.offset))
    this.length -= index
  }
}

module.exports = Buffers
