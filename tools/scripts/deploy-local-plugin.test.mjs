import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const DEPLOY_SCRIPT_PATH = path.join(scriptDir, 'deploy-local-plugin.mjs')
const INSTALL_SCRIPT_PATH = path.join(scriptDir, 'install-local-plugin.mjs')
const REINSTALL_SCRIPT_PATH = path.join(scriptDir, 'reinstall-local-plugin.mjs')

function createPluginWorkspace() {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-plugin-deploy-'))
  fs.writeFileSync(
    path.join(workspacePath, 'package.json'),
    JSON.stringify({ name: '@xpert-ai/plugin-test-deploy', version: '0.1.0' })
  )
  return workspacePath
}

function runCli(scriptPath, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: {
        ...process.env,
        XPERT_API_URL: '',
        XPERT_ORG_ID: '',
        XPERT_SCOPE: '',
        XPERT_TENANT_ID: '',
        XPERT_TOKEN: '',
        ...env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stderr, stdout }))
  })
}

async function listen(handler) {
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    url: `http://127.0.0.1:${address.port}`
  }
}

function readRequestBody(request) {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk.toString()
    })
    request.on('end', () => resolve(body ? JSON.parse(body) : null))
  })
}

test('refreshes and verifies an existing local plugin without printing the token', async (t) => {
  const workspacePath = createPluginWorkspace()
  t.after(() => fs.rmSync(workspacePath, { force: true, recursive: true }))
  const requests = []
  const server = await listen(async (request, response) => {
    requests.push({ body: await readRequestBody(request), path: request.url })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/plugin/refresh') {
      response.end(JSON.stringify({ success: true }))
      return
    }
    response.end(JSON.stringify([{ name: '@xpert-ai/plugin-test-deploy' }]))
  })
  t.after(() => server.close())

  const result = await runCli(
    DEPLOY_SCRIPT_PATH,
    [
      '--plugin-dir',
      workspacePath,
      '--skip-build',
      '--skip-test',
      '--no-keychain',
      '--api-url',
      server.url,
      '--org-id',
      'org-test'
    ],
    { XPERT_TOKEN: 'secret-test-token' }
  )

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(
    requests.map((item) => item.path),
    ['/api/plugin/refresh', '/api/plugin/by-names']
  )
  assert.equal(requests[0].body.pluginName, '@xpert-ai/plugin-test-deploy')
  assert.doesNotMatch(result.stdout + result.stderr, /secret-test-token/)
  assert.match(result.stdout, /refreshed and verified successfully/)
})

test('falls back to a source-code install when no refreshable registration exists', async (t) => {
  const workspacePath = createPluginWorkspace()
  t.after(() => fs.rmSync(workspacePath, { force: true, recursive: true }))
  const requests = []
  const server = await listen(async (request, response) => {
    requests.push({ body: await readRequestBody(request), path: request.url })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/plugin/refresh') {
      response.statusCode = 400
      response.end(JSON.stringify({ message: 'Plugin is not refreshable in the current scope' }))
      return
    }
    if (request.url === '/api/plugin') {
      response.end(JSON.stringify({ success: true }))
      return
    }
    response.end(JSON.stringify([{ name: '@xpert-ai/plugin-test-deploy' }]))
  })
  t.after(() => server.close())

  const result = await runCli(
    DEPLOY_SCRIPT_PATH,
    [workspacePath, '--skip-build', '--skip-test', '--no-keychain', '--api-url', server.url, '--org-id', 'org-test'],
    { XPERT_TOKEN: 'secret-test-token' }
  )

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(
    requests.map((item) => item.path),
    ['/api/plugin/refresh', '/api/plugin', '/api/plugin/by-names']
  )
  assert.deepEqual(requests[1].body, {
    pluginName: '@xpert-ai/plugin-test-deploy',
    source: 'code',
    sourceConfig: { workspacePath }
  })
  assert.match(result.stdout, /installed and verified successfully/)
})

test('installs directly and applies config when deploy receives a config file', async (t) => {
  const workspacePath = createPluginWorkspace()
  t.after(() => fs.rmSync(workspacePath, { force: true, recursive: true }))
  const configPath = path.join(workspacePath, 'plugin-config.json')
  fs.writeFileSync(configPath, JSON.stringify({ feature: 'enabled', apiKey: 'request-secret' }))
  const requests = []
  const server = await listen(async (request, response) => {
    requests.push({ body: await readRequestBody(request), path: request.url })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/plugin') {
      response.end(JSON.stringify({ success: true }))
      return
    }
    response.end(JSON.stringify([{ name: '@xpert-ai/plugin-test-deploy' }]))
  })
  t.after(() => server.close())

  const result = await runCli(
    DEPLOY_SCRIPT_PATH,
    [
      workspacePath,
      '--skip-build',
      '--skip-test',
      '--no-keychain',
      '--api-url',
      server.url,
      '--org-id',
      'org-test',
      '--config-file',
      configPath
    ],
    { XPERT_TOKEN: 'secret-test-token' }
  )

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(
    requests.map((item) => item.path),
    ['/api/plugin', '/api/plugin/by-names']
  )
  assert.deepEqual(requests[0].body.config, { feature: 'enabled', apiKey: 'request-secret' })
  assert.doesNotMatch(result.stdout + result.stderr, /request-secret/)
})

test('keeps install as a low-level entry and redacts request and response secrets', async (t) => {
  const workspacePath = createPluginWorkspace()
  t.after(() => fs.rmSync(workspacePath, { force: true, recursive: true }))
  const requests = []
  const server = await listen(async (request, response) => {
    requests.push({ body: await readRequestBody(request), path: request.url })
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({ success: true, config: { apiKey: 'response-secret' }, internalToken: 'response-token' })
    )
  })
  t.after(() => server.close())

  const result = await runCli(INSTALL_SCRIPT_PATH, [
    workspacePath,
    '--no-keychain',
    '--api-url',
    server.url,
    '--org-id',
    'org-test',
    '--token',
    'cli-secret-token',
    '--config',
    '{"apiKey":"request-secret"}'
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(
    requests.map((item) => item.path),
    ['/api/plugin']
  )
  assert.equal(requests[0].body.config.apiKey, 'request-secret')
  assert.doesNotMatch(result.stdout + result.stderr, /cli-secret-token|request-secret|response-secret|response-token/)
  assert.match(result.stdout, /installed successfully/)
})

test('reinstall is a token-safe compatibility alias for forced deploy', async (t) => {
  const workspacePath = createPluginWorkspace()
  t.after(() => fs.rmSync(workspacePath, { force: true, recursive: true }))
  const requests = []
  const server = await listen(async (request, response) => {
    requests.push({ body: await readRequestBody(request), path: request.url })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/plugin') {
      response.end(JSON.stringify({ success: true }))
      return
    }
    response.end(JSON.stringify([{ name: '@xpert-ai/plugin-test-deploy' }]))
  })
  t.after(() => server.close())

  const result = await runCli(REINSTALL_SCRIPT_PATH, [
    '@xpert-ai/plugin-test-deploy',
    workspacePath,
    '--skip-build',
    '--api-url',
    server.url,
    '--org-id',
    'org-test',
    '--token',
    'reinstall-secret-token'
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(
    requests.map((item) => item.path),
    ['/api/plugin', '/api/plugin/by-names']
  )
  assert.match(result.stderr, /Deprecated: use plugin:deploy:local/)
  assert.doesNotMatch(result.stdout + result.stderr, /reinstall-secret-token/)
})

test('stops with secure setup instructions when no token is available', async (t) => {
  const workspacePath = createPluginWorkspace()
  t.after(() => fs.rmSync(workspacePath, { force: true, recursive: true }))

  const result = await runCli(DEPLOY_SCRIPT_PATH, [
    workspacePath,
    '--skip-build',
    '--skip-test',
    '--no-keychain',
    '--org-id',
    'org-test'
  ])

  assert.equal(result.code, 2)
  assert.match(result.stderr, /No Xpert authentication token was found/)
  assert.match(result.stderr, /Do not paste a token into chat/)
  assert.match(result.stderr, /security add-generic-password/)
})
