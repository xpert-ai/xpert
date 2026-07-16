import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

export const DEFAULT_API_URL = 'http://localhost:3333'
export const DEFAULT_KEYCHAIN_SERVICE = 'xpert-local-plugin-token'
export const ORGANIZATION_SCOPE = 'organization'
export const TENANT_SCOPE = 'tenant'

export class LocalPluginCliError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.name = 'LocalPluginCliError'
    this.exitCode = exitCode
  }
}

export function handleCliError(prefix, error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${prefix}] ${message}`)
  process.exit(error instanceof LocalPluginCliError ? error.exitCode : 1)
}

function toCamelCase(flag) {
  return flag.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

export function parseCliArgs(argv, options = {}) {
  const booleanFlags = new Set(options.booleanFlags ?? [])
  const args = { _: [] }

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]

    if (token === '-h') {
      args.help = true
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

    if (booleanFlags.has(key)) {
      if (inlineValue != null) {
        throw new LocalPluginCliError(`Boolean option --${rawKey} does not accept a value.`)
      }
      args[key] = true
      continue
    }

    let value = inlineValue
    if (value == null) {
      value = argv[index + 1]
      if (value == null || value.startsWith('--')) {
        throw new LocalPluginCliError(`Missing value for --${rawKey}`)
      }
      index += 1
    }
    args[key] = value
  }

  return args
}

export function readPluginPackageJson(workspacePath) {
  const packageJsonPath = path.join(workspacePath, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    throw new LocalPluginCliError(`package.json was not found under plugin directory: ${workspacePath}`)
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  } catch (error) {
    throw new LocalPluginCliError(
      `Failed to parse ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export function resolvePluginInput(args) {
  const firstPositional = args._[0]
  const secondPositional = args._[1]
  const firstPositionalLooksLikeWorkspace =
    !args.pluginDir &&
    !args.workspacePath &&
    typeof firstPositional === 'string' &&
    fs.existsSync(path.resolve(firstPositional))
  const workspaceInput =
    args.pluginDir || args.workspacePath || (firstPositionalLooksLikeWorkspace ? firstPositional : secondPositional)

  if (!workspaceInput) {
    throw new LocalPluginCliError('Plugin directory is required. Pass --plugin-dir <path>.')
  }

  const workspacePath = path.resolve(workspaceInput)
  if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
    throw new LocalPluginCliError(`Plugin directory does not exist or is not a directory: ${workspacePath}`)
  }

  const packageJson = readPluginPackageJson(workspacePath)
  const pluginName =
    args.pluginName || (firstPositionalLooksLikeWorkspace ? undefined : firstPositional) || packageJson?.name
  if (!pluginName) {
    throw new LocalPluginCliError(`package.json is missing "name": ${path.join(workspacePath, 'package.json')}`)
  }

  return { packageJson, pluginName, workspacePath }
}

export function parsePluginConfig(args) {
  if (args.config && args.configFile) {
    throw new LocalPluginCliError('Use either --config or --config-file, not both.')
  }

  let source
  let label
  if (args.configFile) {
    const configPath = path.resolve(args.configFile)
    if (!fs.existsSync(configPath)) {
      throw new LocalPluginCliError(`Config file not found: ${configPath}`)
    }
    source = fs.readFileSync(configPath, 'utf8')
    label = `config file ${configPath}`
  } else if (args.config) {
    source = args.config
    label = '--config JSON'
  } else {
    return undefined
  }

  try {
    return JSON.parse(source)
  } catch (error) {
    throw new LocalPluginCliError(`Failed to parse ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readTokenFromKeychain(account, service) {
  if (process.platform !== 'darwin') {
    return null
  }

  const result = spawnSync('security', ['find-generic-password', '-a', account, '-s', service, '-w'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })
  if (result.status !== 0) {
    return null
  }
  return result.stdout.trim() || null
}

export function resolveAuthentication(args) {
  if (args.token) {
    return { source: '--token', token: args.token }
  }
  if (process.env.XPERT_TOKEN) {
    return { source: 'XPERT_TOKEN', token: process.env.XPERT_TOKEN }
  }
  if (args.noKeychain) {
    return null
  }

  const account = args.keychainAccount || process.env.XPERT_KEYCHAIN_ACCOUNT || os.userInfo().username
  const service = args.keychainService || process.env.XPERT_KEYCHAIN_SERVICE || DEFAULT_KEYCHAIN_SERVICE
  const token = readTokenFromKeychain(account, service)
  return token ? { account, service, source: 'macOS Keychain', token } : null
}

export function missingTokenMessage(args) {
  const account = args.keychainAccount || process.env.XPERT_KEYCHAIN_ACCOUNT || os.userInfo().username
  const service = args.keychainService || process.env.XPERT_KEYCHAIN_SERVICE || DEFAULT_KEYCHAIN_SERVICE
  return `No Xpert authentication token was found.

Do not paste a token into chat or commit it to a repository. Ask the user to store it locally, then rerun:
  security add-generic-password -a "${account}" -s "${service}" -U -w

The command prompts for the token securely. Alternatively set XPERT_TOKEN only in the local process environment.`
}

export function requireAuthentication(args, options = {}) {
  const authentication = resolveAuthentication(args)
  if (!authentication && !options.dryRun) {
    throw new LocalPluginCliError(missingTokenMessage(args), 2)
  }
  return authentication
}

export function createRequestHeaders(args, token) {
  const organizationId = args.orgId || process.env.XPERT_ORG_ID
  const tenantId = args.tenantId || process.env.XPERT_TENANT_ID
  const scope = args.scope || process.env.XPERT_SCOPE || (organizationId ? ORGANIZATION_SCOPE : TENANT_SCOPE)
  const headers = {
    accept: 'application/json',
    authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    'content-type': 'application/json'
  }

  if (scope === ORGANIZATION_SCOPE) {
    if (!organizationId) {
      throw new LocalPluginCliError('Organization scope requires --org-id <id> or XPERT_ORG_ID.')
    }
    headers['organization-id'] = organizationId
    headers['x-scope-level'] = ORGANIZATION_SCOPE
    if (tenantId) {
      headers['tenant-id'] = tenantId
    }
    return headers
  }

  if (scope !== TENANT_SCOPE) {
    throw new LocalPluginCliError(`Unsupported scope "${scope}". Use organization or tenant.`)
  }
  if (!tenantId) {
    throw new LocalPluginCliError('Tenant scope requires --tenant-id <id> or XPERT_TENANT_ID.')
  }
  headers['tenant-id'] = tenantId
  headers['x-scope-level'] = TENANT_SCOPE
  return headers
}

export function redactRequestHeaders(headers) {
  return {
    ...headers,
    ...(headers.authorization ? { authorization: 'Bearer ***' } : {})
  }
}

export function resolvePluginEndpoint(args) {
  if (args.endpoint) {
    return args.endpoint.replace(/\/+$/, '')
  }

  const input = (args.apiUrl || process.env.XPERT_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')
  if (input.endsWith('/api/plugin')) {
    return input
  }
  if (input.endsWith('/api')) {
    return `${input}/plugin`
  }
  return `${input}/api/plugin`
}

export async function postJson(url, headers, body) {
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  } catch (error) {
    throw new LocalPluginCliError(
      `Could not reach Xpert API at ${url}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const responseText = await response.text()
  let responseBody = responseText
  if (responseText && response.headers.get('content-type')?.includes('application/json')) {
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      responseBody = responseText
    }
  }
  return { body: responseBody, ok: response.ok, status: response.status }
}

export function readResponseMessage(body) {
  let message = ''
  if (typeof body === 'string') {
    message = body.trim()
  } else if (body && typeof body === 'object') {
    if (Array.isArray(body.message)) {
      message = body.message.filter((item) => typeof item === 'string').join('; ')
    } else if (typeof body.message === 'string') {
      message = body.message
    } else if (typeof body.error === 'string') {
      message = body.error
    }
  }
  return message.slice(0, 2000)
}

export function assertResponseOk(action, response) {
  if (response.ok) {
    return
  }
  if (response.status === 401) {
    throw new LocalPluginCliError(
      `${action} returned 401. The Xpert token is missing, expired, or invalid. Replace XPERT_TOKEN or update the Keychain item.`
    )
  }
  const message = readResponseMessage(response.body)
  throw new LocalPluginCliError(`${action} failed with HTTP ${response.status}${message ? `: ${message}` : '.'}`)
}

export function summarizePluginResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }

  const summary = {}
  for (const key of ['success', 'name', 'pluginName', 'packageName', 'version', 'source', 'status', 'scopeKey']) {
    const value = body[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value
    }
  }
  return Object.keys(summary).length ? summary : null
}

export function isVerifiedPluginList(body) {
  if (Array.isArray(body)) {
    return body.length > 0
  }
  return Boolean(body && typeof body === 'object' && Array.isArray(body.items) && body.items.length > 0)
}
