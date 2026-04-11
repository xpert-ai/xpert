#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_API_URL = 'http://localhost:3333'
const DEFAULT_SOURCE = 'code'
const ORGANIZATION_SCOPE = 'organization'

function printUsage() {
  console.log(`Install a local plugin workspace into a running Xpert API.

Usage:
  pnpm plugin:install:local --workspace-path /abs/path/to/plugin --org-id <org-id> [options]
  pnpm plugin:install:local <plugin-name> <workspace-path> --org-id <org-id> [options]

Options:
  --plugin-name <name>       Plugin package name. If omitted, read from workspace package.json
  --workspace-path <path>    Plugin workspace path. Relative paths are resolved to absolute paths
  --org-id <id>              Organization-Id header used for org-scoped install
  --tenant-id <id>           Optional Tenant-Id header
  --token <jwt>              Bearer token used for Authorization header
  --api-url <url>            API origin, default: ${DEFAULT_API_URL}
  --endpoint <url>           Full install endpoint. Overrides --api-url
  --version <version>        Optional plugin version
  --config <json>            Optional JSON config payload
  --config-file <path>       Optional JSON config file path
  --dry-run                  Print the request without sending it
  --help                     Show this help

Environment fallbacks:
  XPERT_API_URL
  XPERT_TOKEN
  XPERT_ORG_ID
  XPERT_TENANT_ID

Examples:
  pnpm plugin:install:local --workspace-path ../xpert-plugins/xpertai/integrations/lark --org-id org_123 --token <jwt>
  pnpm plugin:install:local @xpert-ai/plugin-lark /Users/me/GitHub/xpert-plugins/xpertai/integrations/lark --org-id org_123
`)
}

function fail(message) {
  console.error(`[plugin:install:local] ${message}`)
  process.exit(1)
}

function trimSlashes(value) {
  return value.replace(/\/+$/, '')
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

function readPluginNameFromWorkspace(workspacePath) {
  const packageJsonPath = path.join(workspacePath, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    fail(`package.json not found under workspace path: ${workspacePath}`)
  }

  let packageJson
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  } catch (error) {
    fail(`Failed to parse ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!packageJson?.name) {
    fail(`package.json is missing "name": ${packageJsonPath}`)
  }

  return packageJson.name
}

function parseConfig(args) {
  if (args.config && args.configFile) {
    fail('Use either --config or --config-file, not both.')
  }

  if (args.configFile) {
    const configPath = path.resolve(args.configFile)
    if (!fs.existsSync(configPath)) {
      fail(`Config file not found: ${configPath}`)
    }

    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch (error) {
      fail(`Failed to parse config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (args.config) {
    try {
      return JSON.parse(args.config)
    } catch (error) {
      fail(`Failed to parse --config JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return undefined
}

function resolveEndpoint(args) {
  if (args.endpoint) {
    return args.endpoint
  }

  const apiUrl = trimSlashes(args.apiUrl || process.env.XPERT_API_URL || DEFAULT_API_URL)
  if (apiUrl.endsWith('/api/plugin')) {
    return apiUrl
  }
  if (apiUrl.endsWith('/api')) {
    return `${apiUrl}/plugin`
  }
  return `${apiUrl}/api/plugin`
}

function buildHeaders(args) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json'
  }

  const token = args.token || process.env.XPERT_TOKEN
  if (token) {
    headers.authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  }

  const organizationId = args.orgId || process.env.XPERT_ORG_ID
  if (!organizationId) {
    fail('Organization ID is required. Pass --org-id <id> or set XPERT_ORG_ID.')
  }

  headers['organization-id'] = organizationId
  headers['x-scope-level'] = ORGANIZATION_SCOPE

  const tenantId = args.tenantId || process.env.XPERT_TENANT_ID
  if (tenantId) {
    headers['tenant-id'] = tenantId
  }

  return headers
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printUsage()
    return
  }

  const firstPositional = args._[0]
  const secondPositional = args._[1]
  const firstPositionalLooksLikeWorkspace =
    !args.workspacePath && typeof firstPositional === 'string' && fs.existsSync(path.resolve(firstPositional))
  const positionalPluginName = firstPositionalLooksLikeWorkspace ? undefined : firstPositional
  const positionalWorkspacePath = firstPositionalLooksLikeWorkspace ? firstPositional : secondPositional
  const workspacePath = resolveWorkspacePath(args.workspacePath || positionalWorkspacePath)

  if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
    fail(`Workspace path does not exist or is not a directory: ${workspacePath}`)
  }

  const pluginName = args.pluginName || positionalPluginName || readPluginNameFromWorkspace(workspacePath)
  if (args.mode) {
    fail('The --mode option has been removed. Local code installs now always use copy mode.')
  }

  const endpoint = resolveEndpoint(args)
  const headers = buildHeaders(args)
  const config = parseConfig(args)
  const body = {
    pluginName,
    source: DEFAULT_SOURCE,
    sourceConfig: {
      workspacePath
    }
  }

  if (args.version) {
    body.version = args.version
  }

  if (config !== undefined) {
    body.config = config
  }

  const safeHeaders = { ...headers }
  if (safeHeaders.authorization) {
    safeHeaders.authorization = 'Bearer ***'
  }

  console.log('[plugin:install:local] endpoint:', endpoint)
  console.log('[plugin:install:local] headers:', JSON.stringify(safeHeaders, null, 2))
  console.log('[plugin:install:local] body:', JSON.stringify(body, null, 2))

  if (args.dryRun) {
    console.log('[plugin:install:local] Dry run only. Request was not sent.')
    return
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  const responseText = await response.text()
  let responseBody = responseText
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json') && responseText) {
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      // Keep original text when parsing fails.
    }
  }

  if (!response.ok) {
    console.error('[plugin:install:local] Request failed with status', response.status)
    console.error(
      '[plugin:install:local] response:',
      typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody, null, 2)
    )
    process.exit(1)
  }

  console.log(
    '[plugin:install:local] response:',
    typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody, null, 2)
  )
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
