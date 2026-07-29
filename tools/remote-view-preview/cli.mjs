#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { startRemoteViewPreview } from './preview-host.mjs'

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
  process.exit(0)
}
if (!options.config) {
  printHelp()
  throw new Error('The --config option is required.')
}

const configPath = resolve(process.cwd(), options.config)
const configModule = await import(pathToFileURL(configPath).href)
const config = configModule.default
const preview = await startRemoteViewPreview(config, {
  host: options.host,
  port: options.port,
  workspaceRoot: options.workspaceRoot
})

let closing = false
async function close() {
  if (closing) {
    return
  }
  closing = true
  await preview.close()
}

process.once('SIGINT', () => {
  void close().finally(() => process.exit(0))
})
process.once('SIGTERM', () => {
  void close().finally(() => process.exit(0))
})

function parseArgs(args) {
  const result = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') {
      result.help = true
      continue
    }
    const [name, inlineValue] = argument.split('=', 2)
    if (!['--config', '--host', '--port', '--workspace-root'].includes(name)) {
      throw new Error(`Unknown Remote View preview option '${argument}'.`)
    }
    const value = inlineValue ?? args[++index]
    if (!value) {
      throw new Error(`Remote View preview option '${name}' requires a value.`)
    }
    if (name === '--config') {
      result.config = value
    } else if (name === '--host') {
      result.host = value
    } else if (name === '--port') {
      result.port = Number(value)
    } else {
      result.workspaceRoot = value
    }
  }
  return result
}

function printHelp() {
  console.log(`Usage:
  corepack pnpm remote-view:preview --config <preview.config.mjs> [options]

Options:
  --host <host>              Bind host (default: 127.0.0.1)
  --port <port>              Bind port; use 0 for an available port
  --workspace-root <path>    Override config workspace root
  --help                     Show this help`)
}
