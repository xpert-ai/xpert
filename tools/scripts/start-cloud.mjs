#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const workspaceRoot = process.cwd()
const envFilePath = path.join(workspaceRoot, '.env')

const env = {
  ...process.env
}

const webPort = resolveWebPort()
const args = ['nx', 'serve', 'cloud']

if (webPort) {
  args.push('--port', webPort)
  env.WEB_PORT = webPort
  console.log(`[start:cloud] Using WEB_PORT=${webPort}`)
}

const child = spawn('pnpm', args, {
  cwd: workspaceRoot,
  env,
  shell: true,
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error(`[start:cloud] Failed to launch cloud app: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

function resolveWebPort() {
  const directValue = process.env.WEB_PORT?.trim()
  if (directValue) {
    return normalizePort(directValue, 'process.env.WEB_PORT')
  }

  const envValue = readEnvFileValue(envFilePath, 'WEB_PORT')
  if (envValue) {
    return normalizePort(envValue, '.env WEB_PORT')
  }

  return undefined
}

function readEnvFileValue(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return undefined
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || match[1] !== key) {
      continue
    }

    return normalizeEnvValue(match[2])
  }

  return undefined
}

function normalizeEnvValue(rawValue) {
  const trimmedValue = rawValue.trim()
  if (!trimmedValue) {
    return ''
  }

  const firstChar = trimmedValue[0]
  if ((firstChar === '"' || firstChar === "'") && trimmedValue.endsWith(firstChar)) {
    return trimmedValue.slice(1, -1).trim()
  }

  return trimmedValue.replace(/\s+#.*$/, '').trim()
}

function normalizePort(value, source) {
  if (!/^\d+$/.test(value)) {
    console.warn(`[start:cloud] Ignoring ${source}: "${value}" is not a valid port number.`)
    return undefined
  }

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn(`[start:cloud] Ignoring ${source}: "${value}" is outside the valid port range.`)
    return undefined
  }

  return String(port)
}
