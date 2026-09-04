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
const SCRIPT_PATH = path.join(scriptDir, 'init-assistant-suite.mjs')

/** Creates a portable one-role suite profile for CLI integration tests. */
function createProfile(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-assistant-suite-'))
  const profilePath = path.join(directory, 'suite.json')
  const profile = {
    schemaVersion: 'xpert-assistant-suite@1',
    key: 'test-acceptance-v1',
    plugin: { name: '@xpert-ai/plugin-test-suite', version: '1.2.3' },
    roles: [
      {
        key: 'bom',
        templateKey: 'bom-engineer',
        name: 'test-bom-engineer',
        title: 'Test BOM Engineer',
        primaryAgentKey: 'Agent_BomEngineer'
      }
    ],
    orchestrator: {
      key: 'orchestrator',
      templateKey: 'orchestrator',
      name: 'test-orchestrator',
      title: 'Test Orchestrator',
      primaryAgentKey: 'Agent_LifecycleOrchestrator',
      externalRoleKeys: ['bom']
    },
    ...overrides
  }
  fs.writeFileSync(profilePath, JSON.stringify(profile))
  return { directory, profile, profilePath }
}

/** Runs the suite CLI with credentials and scope environment isolated from the host process. */
function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      env: {
        ...process.env,
        XPERT_API_URL: '',
        XPERT_ASSISTANT_SUITE_MANIFEST: '',
        XPERT_ORG_ID: '',
        XPERT_TENANT_ID: '',
        XPERT_TOKEN: '',
        XPERT_USERNAME: '',
        XPERT_PASSWORD: '',
        XPERT_USERNAME_KEYCHAIN_SERVICE: '',
        XPERT_PASSWORD_KEYCHAIN_SERVICE: '',
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

/** Starts a disposable HTTP API used to verify the exact authoring request sequence. */
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

/** Reads an optional JSON request body. */
function readRequestBody(request) {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk.toString()
    })
    request.on('end', () => resolve(body ? JSON.parse(body) : null))
  })
}

/** Produces the graph shape returned by the official Xpert team endpoint. */
function team({ id, name, title, templateKey, agentKey, draft, graph, version }) {
  return {
    id,
    name,
    title,
    version,
    options: {
      templateSource: { pluginName: '@xpert-ai/plugin-test-suite', templateKey }
    },
    ...(draft ? { draft } : {}),
    graph: graph ?? {
      nodes: [{ key: agentKey, type: 'agent', entity: { key: agentKey, leaderKey: null } }],
      connections: []
    }
  }
}

test('dry-run validates a suite locally and preserves a null publication environment', async (t) => {
  const fixture = createProfile()
  t.after(() => fs.rmSync(fixture.directory, { force: true, recursive: true }))

  const result = await runCli([
    '--profile',
    fixture.profilePath,
    '--workspace-id',
    'workspace-test',
    '--org-id',
    'org-test',
    '--run-id',
    'acceptance-01',
    '--dry-run',
    '--no-keychain'
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Scope: organization/)
  assert.match(result.stdout, /Environment: null/)
  assert.match(result.stdout, /Existing instance policy: create only/)
  assert.match(result.stdout, /No API request was sent/)
})

test('installs roles first and publishes an Orchestrator with one direct required external Xpert', async (t) => {
  const fixture = createProfile()
  t.after(() => fs.rmSync(fixture.directory, { force: true, recursive: true }))
  const manifestPath = path.join(fixture.directory, 'receipt.json')
  const requests = []
  let savedDraft = null
  let published = false
  const installed = new Map()

  const server = await listen(async (request, response) => {
    const body = await readRequestBody(request)
    requests.push({ body, method: request.method, path: request.url })
    response.setHeader('content-type', 'application/json')

    if (request.url === '/api/plugin/by-names') {
      response.end(JSON.stringify([{ name: '@xpert-ai/plugin-test-suite', version: '1.2.3' }]))
      return
    }
    if (request.method === 'GET' && request.url.startsWith('/api/xpert-template/')) {
      const template = decodeURIComponent(request.url.slice('/api/xpert-template/'.length))
      response.end(JSON.stringify({ pluginName: '@xpert-ai/plugin-test-suite', key: template }))
      return
    }
    if (request.method === 'GET' && request.url.startsWith('/api/xpert/by-workspace/')) {
      response.end(JSON.stringify({ items: [] }))
      return
    }
    if (request.method === 'POST' && request.url.startsWith('/api/xpert-template/')) {
      const template = decodeURIComponent(request.url.slice('/api/xpert-template/'.length, -'/install'.length))
        .split(':')
        .at(-1)
      const id = template === 'orchestrator' ? 'orchestrator-id' : 'role-id'
      installed.set(id, { name: body.basic.name, title: body.basic.title, template })
      response.end(JSON.stringify({ xpert: { id } }))
      return
    }
    if (request.method === 'POST' && request.url === '/api/xpert/orchestrator-id/draft') {
      savedDraft = body
      response.end(JSON.stringify({ success: true }))
      return
    }
    if (request.method === 'POST' && request.url === '/api/xpert/orchestrator-id/publish?newVersion=false') {
      published = true
      response.end(JSON.stringify({ success: true }))
      return
    }
    if (request.method === 'GET' && request.url === '/api/xpert/role-id/team') {
      const item = installed.get('role-id')
      response.end(
        JSON.stringify(
          team({
            id: 'role-id',
            name: item.name,
            title: item.title,
            templateKey: 'bom-engineer',
            agentKey: 'Agent_BomEngineer',
            version: 1
          })
        )
      )
      return
    }
    if (request.method === 'GET' && request.url === '/api/xpert/orchestrator-id/team') {
      const item = installed.get('orchestrator-id')
      const draft = {
        team: {
          agent: { key: 'Agent_LifecycleOrchestrator' },
          options: {
            templateSource: { pluginName: '@xpert-ai/plugin-test-suite', templateKey: 'orchestrator' }
          }
        },
        nodes: [{ key: 'Agent_LifecycleOrchestrator', type: 'agent' }],
        connections: []
      }
      response.end(
        JSON.stringify(
          team({
            id: 'orchestrator-id',
            name: item.name,
            title: item.title,
            templateKey: 'orchestrator',
            agentKey: 'Agent_LifecycleOrchestrator',
            version: published ? 1 : null,
            draft,
            graph: published ? { nodes: savedDraft.nodes, connections: savedDraft.connections } : undefined
          })
        )
      )
      return
    }

    response.statusCode = 404
    response.end(JSON.stringify({ message: `Unhandled ${request.method} ${request.url}` }))
  })
  t.after(() => server.close())

  const result = await runCli(
    [
      '--profile',
      fixture.profilePath,
      '--workspace-id',
      'workspace-test',
      '--org-id',
      'org-test',
      '--run-id',
      'acceptance-02',
      '--api-url',
      server.url,
      '--manifest-file',
      manifestPath,
      '--no-keychain'
    ],
    { XPERT_TOKEN: 'suite-secret-token' }
  )

  assert.equal(result.code, 0, result.stderr)
  assert.ok(savedDraft)
  assert.deepEqual(savedDraft.connections, [
    {
      key: 'Agent_LifecycleOrchestrator/role-id',
      type: 'xpert',
      from: 'Agent_LifecycleOrchestrator',
      to: 'role-id',
      required: true
    }
  ])
  const installRequests = requests.filter((item) => item.path.endsWith('/install'))
  assert.equal(installRequests[0].body.publish, true)
  assert.equal(installRequests[1].body.publish, false)
  const publishRequest = requests.find((item) => item.path.includes('/publish?'))
  assert.equal(publishRequest.body.environmentId, null)
  assert.doesNotMatch(result.stdout + result.stderr, /suite-secret-token/)

  const receipt = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(receipt.schemaVersion, 'xpert-assistant-suite-installation@1')
  assert.equal(receipt.scope.organizationId, 'org-test')
  assert.equal(receipt.scope.environmentId, null)
  assert.equal(receipt.orchestrator.requiredExternalConnections, 1)
  assert.equal(receipt.readyForTesting, true)
})

test('refreshes an exact existing suite, restores required bindings, and republishes every Assistant', async (t) => {
  const fixture = createProfile()
  t.after(() => fs.rmSync(fixture.directory, { force: true, recursive: true }))
  const requests = []
  let savedDraft = null
  let orchestratorPublished = false

  const server = await listen(async (request, response) => {
    const body = await readRequestBody(request)
    requests.push({ body, method: request.method, path: request.url })
    response.setHeader('content-type', 'application/json')

    if (request.url === '/api/plugin/by-names') {
      response.end(JSON.stringify([{ name: '@xpert-ai/plugin-test-suite', version: '1.2.3' }]))
      return
    }
    if (request.method === 'GET' && request.url.startsWith('/api/xpert-template/')) {
      const template = decodeURIComponent(request.url.slice('/api/xpert-template/'.length))
      response.end(JSON.stringify({ pluginName: '@xpert-ai/plugin-test-suite', key: template }))
      return
    }
    if (request.method === 'GET' && request.url.startsWith('/api/xpert/by-workspace/')) {
      const data = JSON.parse(new URL(request.url, server.url).searchParams.get('data'))
      const isOrchestrator = data.where.name === 'test-orchestrator-refresh-01'
      response.end(
        JSON.stringify({
          items: [{ id: isOrchestrator ? 'orchestrator-id' : 'role-id', name: data.where.name }]
        })
      )
      return
    }
    if (request.method === 'POST' && request.url.endsWith('/sync-template')) {
      response.end(JSON.stringify({ success: true }))
      return
    }
    if (request.method === 'POST' && request.url === '/api/xpert/orchestrator-id/draft') {
      savedDraft = body
      response.end(JSON.stringify({ success: true }))
      return
    }
    if (request.method === 'POST' && request.url.endsWith('/publish?newVersion=false')) {
      if (request.url.startsWith('/api/xpert/orchestrator-id/')) orchestratorPublished = true
      response.end(JSON.stringify({ success: true }))
      return
    }
    if (request.method === 'GET' && request.url === '/api/xpert/role-id/team') {
      response.end(
        JSON.stringify(
          team({
            id: 'role-id',
            name: 'test-bom-engineer-refresh-01',
            title: 'Test BOM Engineer refresh-01',
            templateKey: 'bom-engineer',
            agentKey: 'Agent_BomEngineer',
            version: 2
          })
        )
      )
      return
    }
    if (request.method === 'GET' && request.url === '/api/xpert/orchestrator-id/team') {
      const draft = savedDraft ?? {
        team: {
          agent: { key: 'Agent_LifecycleOrchestrator' },
          options: {
            templateSource: { pluginName: '@xpert-ai/plugin-test-suite', templateKey: 'orchestrator' }
          }
        },
        nodes: [{ key: 'Agent_LifecycleOrchestrator', type: 'agent' }],
        connections: []
      }
      response.end(
        JSON.stringify(
          team({
            id: 'orchestrator-id',
            name: 'test-orchestrator-refresh-01',
            title: 'Test Orchestrator refresh-01',
            templateKey: 'orchestrator',
            agentKey: 'Agent_LifecycleOrchestrator',
            version: 2,
            draft,
            graph: orchestratorPublished ? { nodes: savedDraft.nodes, connections: savedDraft.connections } : undefined
          })
        )
      )
      return
    }

    response.statusCode = 404
    response.end(JSON.stringify({ message: `Unhandled ${request.method} ${request.url}` }))
  })
  t.after(() => server.close())

  const result = await runCli(
    [
      '--profile',
      fixture.profilePath,
      '--workspace-id',
      'workspace-test',
      '--org-id',
      'org-test',
      '--run-id',
      'refresh-01',
      '--api-url',
      server.url,
      '--refresh',
      '--no-keychain'
    ],
    { XPERT_TOKEN: 'suite-secret-token' }
  )

  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /refresh exact existing batch/)
  assert.equal(requests.filter((item) => item.path.endsWith('/sync-template')).length, 2)
  assert.equal(requests.filter((item) => item.path.endsWith('/install')).length, 0)
  assert.equal(requests.filter((item) => item.path.endsWith('/publish?newVersion=false')).length, 2)
  assert.deepEqual(savedDraft.connections, [
    {
      key: 'Agent_LifecycleOrchestrator/role-id',
      type: 'xpert',
      from: 'Agent_LifecycleOrchestrator',
      to: 'role-id',
      required: true
    }
  ])
})

test('rejects using refresh as partial-run recovery', async (t) => {
  const fixture = createProfile()
  t.after(() => fs.rmSync(fixture.directory, { force: true, recursive: true }))

  const result = await runCli([
    '--profile',
    fixture.profilePath,
    '--workspace-id',
    'workspace-test',
    '--org-id',
    'org-test',
    '--run-id',
    'refresh-02',
    '--refresh',
    '--resume',
    '--dry-run',
    '--no-keychain'
  ])

  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /--refresh and --resume are mutually exclusive/)
})

test('refuses to overwrite a colliding Assistant unless resume is explicit', async (t) => {
  const fixture = createProfile()
  t.after(() => fs.rmSync(fixture.directory, { force: true, recursive: true }))
  let installRequests = 0
  const server = await listen(async (request, response) => {
    const body = await readRequestBody(request)
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/plugin/by-names') {
      response.end(JSON.stringify([{ name: '@xpert-ai/plugin-test-suite', version: '1.2.3' }]))
      return
    }
    if (request.method === 'GET' && request.url.startsWith('/api/xpert-template/')) {
      const template = decodeURIComponent(request.url.slice('/api/xpert-template/'.length))
      response.end(JSON.stringify({ pluginName: '@xpert-ai/plugin-test-suite', key: template }))
      return
    }
    if (request.method === 'GET' && request.url.startsWith('/api/xpert/by-workspace/')) {
      const data = JSON.parse(new URL(request.url, server.url).searchParams.get('data'))
      response.end(JSON.stringify({ items: [{ id: 'existing-id', name: data.where.name }] }))
      return
    }
    if (request.method === 'POST' && request.url.endsWith('/install')) {
      installRequests += 1
    }
    response.statusCode = 500
    response.end(JSON.stringify({ message: body ? 'unexpected mutation' : 'unexpected request' }))
  })
  t.after(() => server.close())

  const result = await runCli(
    [
      '--profile',
      fixture.profilePath,
      '--workspace-id',
      'workspace-test',
      '--org-id',
      'org-test',
      '--run-id',
      'acceptance-03',
      '--api-url',
      server.url,
      '--no-keychain'
    ],
    { XPERT_TOKEN: 'suite-secret-token' }
  )

  assert.notEqual(result.code, 0)
  assert.equal(installRequests, 0)
  assert.match(result.stderr, /already exists.*new --run-id.*--resume/i)
})

test('rejects duplicate external role declarations during local profile validation', async (t) => {
  const fixture = createProfile({
    orchestrator: {
      key: 'orchestrator',
      templateKey: 'orchestrator',
      name: 'test-orchestrator',
      title: 'Test Orchestrator',
      primaryAgentKey: 'Agent_LifecycleOrchestrator',
      externalRoleKeys: ['bom', 'bom']
    }
  })
  t.after(() => fs.rmSync(fixture.directory, { force: true, recursive: true }))

  const result = await runCli([
    '--profile',
    fixture.profilePath,
    '--workspace-id',
    'workspace-test',
    '--org-id',
    'org-test',
    '--dry-run',
    '--no-keychain'
  ])

  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /Duplicate external role key: bom/)
})
