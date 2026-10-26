#!/usr/bin/env node

// Local startup owns the complete build → apply → verify → serve sequence.
// Every restart must pass the gate; failures never fall through to serving.
// Baseline adoption is explicit, and the API itself continues to disable DDL.
// Stop the active process tree before exiting so restarts cannot leave an old API running.
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import process from 'node:process'

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url))

export function runCommand(command, args, { cwd, env, signal, stdio = 'inherit' }) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
      detached: process.platform !== 'win32',
      // Corepack is a .cmd shim on Windows. Only fixed, internal arguments use a shell.
      shell: process.platform === 'win32' && command === 'corepack'
    })
    let killTimer
    let spawnError
    const stopTree = (force = false) => {
      if (!child.pid) return
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        killer.on('error', () => child.kill())
      } else {
        try {
          process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
        } catch (error) {
          if (error.code !== 'ESRCH') child.kill(force ? 'SIGKILL' : 'SIGTERM')
        }
      }
    }
    const abort = () => {
      stopTree()
      killTimer = setTimeout(() => stopTree(true), 10_000)
      killTimer.unref()
    }
    signal?.addEventListener('abort', abort, { once: true })
    child.on('error', (error) => {
      spawnError = error
    })
    child.on('close', (code, childSignal) => {
      if (signal?.aborted || spawnError || code !== 0) stopTree(true)
      clearTimeout(killTimer)
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) reject(signal.reason)
      else if (spawnError) reject(spawnError)
      else if (code !== 0) reject(new Error(`Process exited with ${childSignal ?? code}`))
      else resolve()
    })
  })
}

export async function runApiWorkflow({
  mode = 'serve',
  inspect = false,
  signal,
  run = runCommand,
  log = console.log,
  env = process.env
} = {}) {
  if (!['serve', 'schema', 'baseline'].includes(mode)) throw new Error(`Invalid startup mode: ${mode}`)
  const api = path.join(workspaceRoot, 'dist/apps/api/main.js')
  const options = { cwd: workspaceRoot, env: { ...env, NODE_ENV: 'development' }, signal }
  const stage = async (name, command, args) => {
    signal?.throwIfAborted()
    log(`[start:api] ${name}`)
    try {
      await run(command, args, options)
    } catch (error) {
      if (signal?.aborted) throw error
      throw new Error(`${name} failed; API was not started. ${error.message}`, { cause: error })
    }
  }
  await stage('Build libraries', 'corepack', ['pnpm', 'b:p:all'])
  await stage('Build API and migration assets', 'corepack', [
    'pnpm',
    'nx',
    'build',
    'api',
    '--configuration=development'
  ])
  if (mode === 'baseline') {
    await stage('Adopt verified database baseline', process.execPath, [
      api,
      '--command',
      'schema-sync',
      '--action',
      'baseline'
    ])
  }
  await stage('Apply database changes', process.execPath, [api, '--command', 'schema-sync', '--action', 'apply'])
  await stage('Verify database structure', process.execPath, [api, '--command', 'schema-sync', '--action', 'verify'])
  if (mode === 'serve') {
    signal?.throwIfAborted()
    log('[start:api] Database verified. Starting API.')
    await run(process.execPath, [...(inspect ? ['--inspect=127.0.0.1:9229'] : []), api], options)
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (
    args.some((arg) => !['--schema-only', '--baseline', '--inspect'].includes(arg)) ||
    (args.includes('--schema-only') && args.includes('--baseline'))
  ) {
    throw new Error('Usage: start-api.mjs [--schema-only | --baseline] [--inspect]')
  }
  const controller = new AbortController()
  const stop = (signal) => {
    process.exitCode = signal === 'SIGINT' ? 130 : 143
    controller.abort(new Error(`Stopped by ${signal}`))
  }
  const interrupt = () => stop('SIGINT')
  const terminate = () => stop('SIGTERM')
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    await runApiWorkflow({
      mode: args.includes('--baseline') ? 'baseline' : args.includes('--schema-only') ? 'schema' : 'serve',
      inspect: args.includes('--inspect'),
      signal: controller.signal
    })
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error(`[start:api] ${error.message}`)
      console.error(
        '[start:api] See docs/development/database-migrations.md. BASELINE_REQUIRED needs explicit adoption; structural drift must be repaired before retrying.'
      )
      process.exitCode = 1
    }
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[start:api] ${error.message}`)
    process.exitCode = 1
  })
}
