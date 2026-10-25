// Invariants: receipts contain operational IDs/hashes, never credentials or full draft content.
// Write checkpoints before requests; an interrupted publication is reconciled against the live graph.
import fs from 'node:fs'
import path from 'node:path'
import { LocalPluginCliError } from '../local-plugin-cli.mjs'

export function readReceipt(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new LocalPluginCliError('Cannot read the release/installation receipt.')
  }
}

export function saveReceipt(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, file)
  fs.chmodSync(file, 0o600)
}

export function lockReceipt(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const lock = `${file}.lock`
  // A process killed between checkpoints can leave its lock. Reclaim only a local, dead PID.
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'))
    let alive = true
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0)
      } catch (error) {
        if (error.code === 'ESRCH') alive = false
      }
    }
    if (alive) throw new LocalPluginCliError('This release receipt is already in use.')
    fs.unlinkSync(lock)
  }
  const descriptor = fs.openSync(lock, 'wx', 0o600)
  fs.writeFileSync(descriptor, String(process.pid))
  fs.closeSync(descriptor)
  return () => fs.unlinkSync(lock)
}

export {
  hash,
  graphHash,
  stateHash,
  modelHash
} from '../../../packages/server-ai/src/plugin-resource/application-update/engine/state.cjs'
