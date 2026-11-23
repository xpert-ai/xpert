#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  createRequestHeaders,
  handleCliError,
  pluginInstallationScope,
  queryPluginDescriptors,
  requestJson,
  requireAuthentication,
  resolvePluginEndpoint
} from './local-plugin-cli.mjs'

const usage = `corepack pnpm plugin:deploy:archive publish <package.tgz>
corepack pnpm plugin:deploy:archive verify <package.tgz> [--smoke-script <executable>]

Both commands use XPERT_API_URL (origin), XPERT_TENANT_ID
and the target's configured XPERT_TOKEN or XPERT_USERNAME with XPERT_PASSWORD
or XPERT_PASSWORD_KEYCHAIN_SERVICE. Organization plugins also use XPERT_ORG_ID.
verify reads XPERT_REPLICA_URLS, a JSON array of trusted, directly pinned origins
covering every serving replica. Run verify again after rollout or restart.`

const requestOptions = { redirect: 'error', timeoutMs: 120_000, expectJson: true }

function required(name) {
  if (!process.env[name]?.trim()) throw new Error(`Set ${name} in the target environment.`)
  return process.env[name]
}

function origin(value) {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Use a trusted HTTPS origin or a loopback origin for a local tunnel.')
  }
  return url.origin
}

async function readArchive(path) {
  const bytes = await readFile(path)
  const manifest = JSON.parse(
    execFileSync('tar', ['-xzOf', '-', 'package/package.json'], {
      input: bytes,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    })
  )
  const { name, version } = manifest
  const { declaredLevel: level, expectedScope: scope } = pluginInstallationScope(manifest, 'organization')
  if (!name || !version || !level) {
    throw new Error('Invalid package name, version or plugin level in the archive.')
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { bytes, name, version, level, scope, sha256, fileName: `sha256-${sha256}.tgz` }
}

function releaseResponse(response, path) {
  if (response.status === 403) {
    throw new Error(
      `HTTP 403 at ${path}. Check the operation’s tenant or organization scope and release identity. If the scope is correct, use the authorized channel or request its credential reference.`
    )
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${path}.`)
  return response.body
}

async function request(base, path, headers, body) {
  const method = body === undefined ? 'GET' : 'POST'
  return releaseResponse(await requestJson(method, base + path, headers, body, requestOptions), path)
}

async function authenticate(base, scope) {
  const { XPERT_TOKEN: token, XPERT_USERNAME: username, XPERT_PASSWORD_KEYCHAIN_SERVICE: service } = process.env
  if (!token && !(username && (process.env.XPERT_PASSWORD || service))) {
    throw new Error('Configure release credentials for the target environment. See --help.')
  }
  let auth
  try {
    auth = await requireAuthentication(
      {
        ...scope,
        apiUrl: base,
        token,
        username,
        noKeychain: !service,
        passwordKeychainService: service
      },
      { requestOptions }
    )
  } catch (error) {
    const status = error.message.match(/\b[45]\d\d\b/)?.[0]
    throw new Error(
      `Release login failed${status ? ' (HTTP ' + status + ')' : ''}. Check the target tenant and credential reference.`
    )
  }
  const headers = createRequestHeaders(scope, auth.token, auth.tenantId)
  const tenantId = auth.tenantId ?? (await request(base, '/api/user/me', headers)).tenantId
  if (tenantId !== scope.tenantId) throw new Error('Authenticated tenant differs from the release target.')
  return headers
}

async function descriptor(base, headers, archive) {
  const endpoint = resolvePluginEndpoint({ apiUrl: base })
  const response = await queryPluginDescriptors(endpoint, headers, archive.name, requestOptions)
  const items = releaseResponse(response, '/api/plugin/by-names')
  const matches = items.filter(
    (item) =>
      (item.packageName ?? item.name) === archive.name &&
      item.level === archive.level &&
      (archive.level !== 'organization' || item.organizationId === headers['organization-id'])
  )
  if (matches.length > 1) throw new Error('Ambiguous plugin installation in the requested scope.')
  return matches[0]
}

function matchesArchive(item, archive) {
  return (
    item?.installedVersion === archive.version &&
    item.installation?.method === 'archive' &&
    item.installation.fileName === archive.fileName
  )
}

async function publish(base, headers, archive) {
  const existing = await descriptor(base, headers, archive)
  if (matchesArchive(existing, archive)) return { registration: 'already present', loadStatus: existing.loadStatus }
  // The host exposes the installed filename but only the version of the running code.
  if (existing?.installedVersion === archive.version) {
    throw new Error(
      'This version is already registered with different or unknown archive provenance. Use a new version so every running replica can be verified.'
    )
  }
  if (existing?.loadStatus === 'pending_restart')
    throw new Error('An earlier release awaits restart. Check that rollout before replacing it.')
  const form = new FormData()
  if (existing) {
    const current = await request(base, '/api/plugin/configuration', headers, { pluginName: existing.name })
    if (
      current?.pluginName !== existing.name ||
      !current.config ||
      typeof current.config !== 'object' ||
      Array.isArray(current.config)
    ) {
      throw new Error('Could not read the existing plugin configuration for upgrade.')
    }
    form.set('config', JSON.stringify(current.config))
  }
  form.set('file', new Blob([archive.bytes]), archive.fileName)
  let receipt
  try {
    receipt = await request(base, '/api/plugin/archive', headers, form)
  } catch (error) {
    throw new Error(`${error.message} Recheck the installation before retrying the upload.`)
  }
  if (
    receipt?.success !== true ||
    (receipt.packageName ?? receipt.name) !== archive.name ||
    receipt.currentVersion !== archive.version
  ) {
    throw new Error('Unexpected upload receipt. Check the installation before retrying.')
  }
  return {
    registration: 'accepted',
    generation: receipt.runtimeConvergence?.generation,
    restartRequired: receipt.restartRequired
  }
}

async function verify(headers, archive, smokeScript) {
  const urls = JSON.parse(required('XPERT_REPLICA_URLS'))
  if (!Array.isArray(urls) || !urls.length) throw new Error('Supply the complete serving replica inventory.')
  const origins = urls.map(origin)
  const instances = new Set()
  for (const [index, base] of origins.entries()) {
    try {
      const ready = await request(base, '/api/health/ready', {})
      if (ready.status !== 'ready' || !ready.instanceId || instances.has(ready.instanceId)) {
        throw new Error('Unready or duplicate instance. Check the pinned replica inventory.')
      }
      const item = await descriptor(base, headers, archive)
      if (
        !matchesArchive(item, archive) ||
        item.runningVersion !== archive.version ||
        item.loadStatus !== 'loaded' ||
        item.loadError
      ) {
        throw new Error('Expected archive is not loaded. Check rollout or restart status and rerun verify.')
      }
      instances.add(ready.instanceId)
    } catch (error) {
      throw new Error(`Replica ${index + 1}/${origins.length}: ${error.message}`)
    }
  }
  if (smokeScript) execFileSync(resolve(smokeScript), [], { stdio: 'inherit' })
  return {
    verifiedReplicas: instances.size,
    expectedReplicas: origins.length,
    ingressSmoke: smokeScript ? 'passed' : 'not run'
  }
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      'smoke-script': { type: 'string' }
    }
  })
  if (values.help) return console.log(usage)
  const [command, path] = positionals
  if (
    positionals.length !== 2 ||
    !['publish', 'verify'].includes(command) ||
    (command === 'publish' && values['smoke-script'])
  )
    throw new Error(usage)
  const archive = await readArchive(path)
  const base = origin(required('XPERT_API_URL'))
  const scope = { scope: archive.scope, tenantId: required('XPERT_TENANT_ID') }
  if (scope.scope === 'organization') scope.orgId = required('XPERT_ORG_ID')
  const headers = await authenticate(base, scope)
  const result =
    command === 'publish'
      ? await publish(base, headers, archive)
      : await verify(headers, archive, values['smoke-script'])
  console.log(
    JSON.stringify({
      name: archive.name,
      version: archive.version,
      sha256: archive.sha256,
      scope: scope.scope,
      ...result
    })
  )
}

main().catch((error) => handleCliError('plugin:deploy:archive', error))
