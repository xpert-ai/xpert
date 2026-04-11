#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DEFAULT_BUILD_CWD = 'workspace'
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const INSTALL_SCRIPT_PATH = path.join(SCRIPT_DIR, 'install-local-plugin.mjs')

function printUsage() {
  console.log(`Rebuild a local plugin workspace and reinstall it into a running Xpert API.

Usage:
  pnpm plugin:reinstall:local --workspace-path /abs/path/to/plugin --org-id <org-id> [options]
  pnpm plugin:reinstall:local <plugin-name> <workspace-path> --org-id <org-id> [options]

Build options:
  --build-command <cmd>      Custom build command. Overrides auto-detection
  --build-cwd <path>         Working directory for --build-command. Default: plugin workspace
  --skip-build               Skip the build step and only reinstall

Install options:
  --plugin-name <name>       Plugin package name. If omitted, read from workspace package.json
  --workspace-path <path>    Plugin workspace path. Relative paths are resolved to absolute paths
  --org-id <id>              Organization-Id header used for org-scoped install
  --tenant-id <id>           Optional Tenant-Id header
  --token <jwt>              Bearer token used for Authorization header
  --api-url <url>            API origin passed to the install step
  --endpoint <url>           Full install endpoint. Overrides --api-url
  --version <version>        Optional plugin version
  --config <json>            Optional JSON config payload
  --config-file <path>       Optional JSON config file path
  --dry-run                  Print build/install actions without executing them
  --help                     Show this help

Environment fallbacks:
  XPERT_API_URL
  XPERT_TOKEN
  XPERT_ORG_ID
  XPERT_TENANT_ID
  XPERT_PLUGIN_BUILD_COMMAND
  XPERT_PLUGIN_BUILD_CWD

Examples:
  pnpm plugin:reinstall:local --workspace-path ../xpert-plugins/xpertai/integrations/lark --org-id org_123 --token <jwt>
  pnpm plugin:reinstall:local @xpert-ai/plugin-lark /Users/me/GitHub/xpert-plugins/xpertai/integrations/lark --org-id org_123 --build-command "pnpm nx build @xpert-ai/plugin-lark"
`)
}

function fail(message) {
  console.error(`[plugin:reinstall:local] ${message}`)
  process.exit(1)
}

function toCamelCase(flag) {
  return flag.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function parseArgs(argv) {
  const args = { _: [] }

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]

    if (token === '--help' || token === '-h') {
      args.help = true
      continue
    }

    if (token === '--dry-run') {
      args.dryRun = true
      continue
    }

    if (token === '--skip-build') {
      args.skipBuild = true
      continue
    }

    if (!token.startsWith('--')) {
      args._.push(token)
      continue
    }

    const flag = token.slice(2)
    const separatorIndex = flag.indexOf('=')
    const rawKey = separatorIndex >= 0 ? flag.slice(0, separatorIndex) : flag
    const inlineValue = separatorIndex >= 0 ? flag.slice(separatorIndex + 1) : undefined
    const key = toCamelCase(rawKey)

    let value = inlineValue
    if (value == null) {
      value = argv[index + 1]
      if (value == null || value.startsWith('--')) {
        fail(`Missing value for --${rawKey}`)
      }
      index += 1
    }

    args[key] = value
  }

  return args
}

function resolveWorkspacePath(workspacePath) {
  if (!workspacePath) {
    fail('workspace path is required. Use --workspace-path <path> or pass it as the second positional argument.')
  }

  return path.resolve(workspacePath)
}

function readPackageJson(packageJsonPath) {
  if (!fs.existsSync(packageJsonPath)) {
    fail(`package.json not found: ${packageJsonPath}`)
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  } catch (error) {
    fail(`Failed to parse ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readPluginNameFromWorkspace(workspacePath) {
  const packageJson = readPackageJson(path.join(workspacePath, 'package.json'))

  if (!packageJson?.name) {
    fail(`package.json is missing "name": ${path.join(workspacePath, 'package.json')}`)
  }

  return packageJson.name
}

function findClosestAncestorWith(filename, startDir) {
  let currentDir = startDir

  while (true) {
    const candidate = path.join(currentDir, filename)
    if (fs.existsSync(candidate)) {
      return currentDir
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }
    currentDir = parentDir
  }
}

function resolveBuildPlan(args, workspacePath, pluginName) {
  if (args.skipBuild) {
    return null
  }

  const buildCommand = args.buildCommand || process.env.XPERT_PLUGIN_BUILD_COMMAND
  if (buildCommand) {
    const buildCwd = path.resolve(args.buildCwd || process.env.XPERT_PLUGIN_BUILD_CWD || workspacePath)
    return {
      cwd: buildCwd,
      display: buildCommand,
      shell: true,
      command: buildCommand
    }
  }

  const packageJson = readPackageJson(path.join(workspacePath, 'package.json'))
  if (packageJson?.scripts?.build) {
    return {
      cwd: workspacePath,
      display: 'pnpm build',
      shell: false,
      command: 'pnpm',
      args: ['build']
    }
  }

  const nxRoot = findClosestAncestorWith('nx.json', workspacePath)
  if (nxRoot) {
    return {
      cwd: nxRoot,
      display: `pnpm nx build ${pluginName}`,
      shell: false,
      command: 'pnpm',
      args: ['nx', 'build', pluginName]
    }
  }

  fail(
    'Could not detect how to build this plugin. Add a local "build" script, use --build-command <cmd>, or pass --skip-build.'
  )
}

function runCommand(plan) {
  console.log('[plugin:reinstall:local] build cwd:', plan.cwd)
  console.log('[plugin:reinstall:local] build command:', plan.display)

  const result = spawnSync(plan.command, plan.args ?? [], {
    cwd: plan.cwd,
    stdio: 'inherit',
    shell: plan.shell ?? false
  })

  if (result.status !== 0) {
    fail(`Build step failed with exit code ${result.status ?? 'unknown'}.`)
  }
}

function buildInstallArgs(args, workspacePath, pluginName) {
  const installArgs = ['--workspace-path', workspacePath, '--plugin-name', pluginName]

  if (args.orgId) {
    installArgs.push('--org-id', args.orgId)
  }
  if (args.tenantId) {
    installArgs.push('--tenant-id', args.tenantId)
  }
  if (args.token) {
    installArgs.push('--token', args.token)
  }
  if (args.apiUrl) {
    installArgs.push('--api-url', args.apiUrl)
  }
  if (args.endpoint) {
    installArgs.push('--endpoint', args.endpoint)
  }
  if (args.version) {
    installArgs.push('--version', args.version)
  }
  if (args.config) {
    installArgs.push('--config', args.config)
  }
  if (args.configFile) {
    installArgs.push('--config-file', args.configFile)
  }
  if (args.dryRun) {
    installArgs.push('--dry-run')
  }

  return installArgs
}

function runInstallStep(installArgs) {
  console.log('[plugin:reinstall:local] install command:', `node ${INSTALL_SCRIPT_PATH} ${installArgs.join(' ')}`)

  const result = spawnSync(process.execPath, [INSTALL_SCRIPT_PATH, ...installArgs], {
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    fail(`Install step failed with exit code ${result.status ?? 'unknown'}.`)
  }
}

function resolvePositionalInput(args) {
  const firstPositional = args._[0]
  const secondPositional = args._[1]
  const firstPositionalLooksLikeWorkspace =
    !args.workspacePath && typeof firstPositional === 'string' && fs.existsSync(path.resolve(firstPositional))

  return {
    pluginName: firstPositionalLooksLikeWorkspace ? undefined : firstPositional,
    workspacePath: firstPositionalLooksLikeWorkspace ? firstPositional : secondPositional
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printUsage()
    return
  }

  const positionalInput = resolvePositionalInput(args)
  const workspacePath = resolveWorkspacePath(args.workspacePath || positionalInput.workspacePath)
  if (args.mode) {
    fail('The --mode option has been removed. Local code reinstalls now always use copy mode.')
  }

  if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
    fail(`Workspace path does not exist or is not a directory: ${workspacePath}`)
  }

  const pluginName = args.pluginName || positionalInput.pluginName || readPluginNameFromWorkspace(workspacePath)
  const buildPlan = resolveBuildPlan(args, workspacePath, pluginName)

  if (buildPlan) {
    if (args.dryRun) {
      console.log('[plugin:reinstall:local] build cwd:', buildPlan.cwd)
      console.log('[plugin:reinstall:local] build command:', buildPlan.display)
      console.log('[plugin:reinstall:local] Dry run only. Build step was not executed.')
    } else {
      runCommand(buildPlan)
    }
  } else {
    console.log('[plugin:reinstall:local] Skipping build step.')
  }

  const installArgs = buildInstallArgs(args, workspacePath, pluginName)
  runInstallStep(installArgs)
}

main()
