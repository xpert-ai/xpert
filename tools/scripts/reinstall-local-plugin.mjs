#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const deployScriptPath = path.join(scriptDir, 'deploy-local-plugin.mjs')

function hasOption(args, option) {
  return args.some((value) => value === option || value.startsWith(`${option}=`))
}

const forwardedArgs = process.argv.slice(2)
const compatibilityOptions = []
if (!hasOption(forwardedArgs, '--force-install')) {
  forwardedArgs.push('--force-install')
  compatibilityOptions.push('--force-install')
}
if (!hasOption(forwardedArgs, '--skip-test') && !hasOption(forwardedArgs, '--test-command')) {
  forwardedArgs.push('--skip-test')
  compatibilityOptions.push('--skip-test')
}

console.warn(
  `[plugin:reinstall:local] Deprecated: use plugin:deploy:local. Forwarding safely${
    compatibilityOptions.length ? ` with ${compatibilityOptions.join(' ')}` : ''
  }.`
)
const result = spawnSync(process.execPath, [deployScriptPath, ...forwardedArgs], { stdio: 'inherit' })
process.exit(result.status ?? 1)
