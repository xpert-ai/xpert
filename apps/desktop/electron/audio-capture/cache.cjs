const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash, randomBytes, randomUUID, createCipheriv, createDecipheriv } = require('node:crypto')
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
const hash = (value) => createHash('sha256').update(value).digest('hex')
async function atomic(file, bytes) {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const handle = await fs.open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(temporary, file)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}
class AudioCaptureCache {
  constructor(root, encryption) {
    this.root = root
    this.encryption = encryption
    this.key = null
    this.writes = new Map()
  }
  async initialize() {
    if (this.key) return
    if (!this.initializing)
      this.initializing = this.initializeKey().finally(() => {
        this.initializing = null
      })
    await this.initializing
  }
  async initializeKey() {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('secure_storage_unavailable')
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 })
    const file = path.join(this.root, 'key.bin')
    let key
    try {
      key = Buffer.from(this.encryption.decryptString(await fs.readFile(file)), 'base64')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      key = randomBytes(32)
      await atomic(file, this.encryption.encryptString(key.toString('base64')))
    }
    if (key.length !== 32) throw new Error('secure_storage_unavailable')
    this.key = key
  }
  directory(scope, id) {
    if (!uuid(id)) throw new Error('invalid_input')
    return path.join(this.root, hash(JSON.stringify(scope)), id)
  }
  seal(value) {
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, nonce)
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted])
  }
  open(bytes) {
    const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'))
  }
  async save(record) {
    await this.initialize()
    const dir = this.directory(record.scope, record.id)
    const previous = this.writes.get(dir) ?? Promise.resolve()
    const write = previous
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(dir, { recursive: true, mode: 0o700 })
        await atomic(path.join(dir, 'session.bin'), this.seal(record))
      })
    this.writes.set(dir, write)
    try {
      await write
    } finally {
      if (this.writes.get(dir) === write) this.writes.delete(dir)
    }
  }
  async chunk(record, chunk) {
    await atomic(
      path.join(this.directory(record.scope, record.id), `${chunk.track}-${chunk.sequence}.bin`),
      this.seal(chunk)
    )
  }
  async readChunk(record, track, sequence) {
    return this.open(await fs.readFile(path.join(this.directory(record.scope, record.id), `${track}-${sequence}.bin`)))
  }
  async acknowledge(record, track, sequence) {
    await fs.rm(path.join(this.directory(record.scope, record.id), `${track}-${sequence}.bin`), { force: true })
  }
  async remove(record) {
    await fs.rm(this.directory(record.scope, record.id), { recursive: true, force: true })
  }
  async list(scope) {
    await this.initialize()
    const dir = path.join(this.root, hash(JSON.stringify(scope)))
    let names
    try {
      names = await fs.readdir(dir)
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
    const records = []
    for (const id of names.filter(uuid)) {
      const record = this.open(await fs.readFile(path.join(dir, id, 'session.bin')))
      if (record.id !== id || JSON.stringify(record.scope) !== JSON.stringify(scope)) throw new Error('cache_corrupt')
      records.push(record)
    }
    return records.sort((a, b) => b.createdAt - a.createdAt)
  }
}
module.exports = { AudioCaptureCache, atomic, hash, uuid }
