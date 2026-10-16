import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./init-assistant-suite.mjs', import.meta.url))
function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: {
        ...process.env,
        XPERT_API_URL: '',
        XPERT_ORG_ID: '',
        XPERT_TENANT_ID: 'tenant',
        XPERT_TOKEN: 'secret-test-token',
        XPERT_USERNAME: '',
        XPERT_PASSWORD: '',
        XPERT_ASSISTANT_SUITE_MANIFEST: '',
        ...env
      }
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('close', (code) => resolve({ code, output }))
  })
}

async function fixture(t, { existing = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-release-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const role = (key, dependencies = []) => ({
    key,
    templateKey: key,
    name: key,
    title: key,
    primaryAgentKey: `Agent_${key}`,
    externalRoleKeys: dependencies
  })
  const profile = {
    schemaVersion: 'xpert-assistant-suite@1',
    key: 'suite',
    plugin: { name: '@xpert-ai/test', version: '1.0' },
    roles: [role('writer', ['figures']), role('figures'), role('commercial')],
    orchestrator: role('main', ['writer'])
  }
  const definitions = [...profile.roles, profile.orchestrator]
  const teams = new Map(),
    requests = [],
    published = []
  let fail,
    afterPublish,
    templateRevision = 'new'
  const create = (definition) => ({
    id: definition.key,
    name: `${definition.name}-run`,
    title: definition.title,
    workspaceId: 'workspace',
    latest: true,
    version: existing ? '1' : null,
    environmentId: `environment-${definition.key}`,
    copilotModel: { copilotId: 'provider', model: 'custom', options: { temperature: 0.42 } },
    options: { templateSource: { pluginName: profile.plugin.name, templateKey: definition.templateKey } },
    graph: {
      nodes: [
        {
          key: definition.primaryAgentKey,
          type: 'agent',
          entity: { key: definition.primaryAgentKey, prompt: 'old', copilotModel: null }
        }
      ],
      connections: []
    },
    draft: null
  })
  if (existing) for (const definition of definitions) teams.set(definition.key, create(definition))
  const server = http.createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    const body = raw ? JSON.parse(raw) : undefined
    const url = new URL(request.url, 'http://localhost')
    const item = { method: request.method, path: url.pathname, query: url.searchParams, body }
    requests.push(item)
    assert.equal(request.headers['organization-id'], 'org')
    assert.equal(request.headers['tenant-id'], 'tenant')
    assert.equal(request.headers['x-scope-level'], 'organization')
    const send = (data, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(data))
    }
    if (fail?.(item)) return send({ message: 'injected failure' }, 503)
    if (url.pathname === '/api/plugin/by-names')
      return send([{ name: profile.plugin.name, currentVersion: '1.0', loadStatus: 'loaded' }])
    if (url.pathname.startsWith('/api/xpert-template/')) {
      const key = decodeURIComponent(url.pathname.split('/')[3]).split(':').at(-1)
      if (request.method === 'GET')
        return send({
          key: `${profile.plugin.name}:${key}`,
          pluginName: profile.plugin.name,
          export_data: `template-${templateRevision}-${key}`
        })
      const definition = definitions.find((item) => item.key === key)
      const team = create(definition)
      team.name = body.basic.name
      team.draft = {
        team: { agent: { key: definition.primaryAgentKey }, copilotModel: team.copilotModel, options: team.options },
        ...structuredClone(team.graph)
      }
      teams.set(key, team)
      return send({ xpert: { id: key } })
    }
    if (url.pathname.startsWith('/api/xpert/by-workspace/')) {
      const { where } = JSON.parse(url.searchParams.get('data'))
      return send({ items: [...teams.values()].filter((team) => team.name === where.name) })
    }
    const [, , , id, action, childAction] = url.pathname.split('/')
    const team = teams.get(id)
    if (!team) return send({ message: 'not found' }, 404)
    if (request.method === 'GET') {
      // Relations are opt-in on the real APIs; the plain authoring response omits the model.
      const relations = action === 'team' ? (JSON.parse(url.searchParams.get('data') || '{}').relations ?? []) : []
      return send({
        ...team,
        draft: action === 'team' ? undefined : team.draft,
        copilotModel: relations.includes('copilotModel') ? team.copilotModel : undefined
      })
    }
    if (action === 'sync-template') {
      const graph = structuredClone(team.graph)
      graph.nodes
        .filter((node) => node.type === 'agent')
        .forEach((node) => {
          node.entity.prompt = 'new'
        })
      team.draft = {
        team: { agent: { key: `Agent_${id}` }, copilotModel: team.copilotModel, options: team.options },
        ...graph
      }
      return send({ xpertId: id })
    }
    if (action === 'draft') {
      team.draft = body
      return send(body)
    }
    if (action === 'publish') {
      assert.equal(url.searchParams.get('newVersion'), 'true')
      team.graph = { nodes: team.draft.nodes, connections: team.draft.connections }
      for (const node of team.graph.nodes.filter((node) => node.type === 'agent')) {
        node.entity = { avatar: null, promptTemplates: null, outputVariables: null, ...node.entity }
      }
      team.options = team.draft.team.options
      team.copilotModel = team.draft.team.copilotModel
      team.draft = null
      team.version = String(Number(team.version || 0) + 1)
      team.environmentId = body.environmentId
      published.push(id)
      if (afterPublish?.(item)) {
        request.socket.destroy()
        return
      }
      return send(team)
    }
    if (action === 'publication' && childAction === 'resume') {
      assert.equal(body.version, team.version)
      return send(team)
    }
    return send({ message: 'not handled' }, 404)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const profilePath = path.join(directory, 'profile.json'),
    manifest = path.join(directory, 'release.json')
  fs.writeFileSync(profilePath, JSON.stringify(profile))
  const args = [
    '--profile',
    profilePath,
    '--workspace-id',
    'workspace',
    '--org-id',
    'org',
    '--run-id',
    'run',
    '--api-url',
    `http://127.0.0.1:${server.address().port}`,
    '--manifest-file',
    manifest,
    '--no-keychain'
  ]
  return {
    profile,
    profilePath,
    manifest,
    teams,
    requests,
    published,
    args,
    fail: (value) => {
      fail = value
    },
    afterPublish: (value) => {
      afterPublish = value
    },
    reviseTemplate: () => {
      templateRevision = 'later'
    }
  }
}

test('refreshes every role, including unreferenced specialists, after preparing all drafts and in dependency order', async (t) => {
  const f = await fixture(t)
  const result = await run([...f.args, '--refresh'])
  assert.equal(result.code, 0, result.output)
  assert.deepEqual(f.published, ['figures', 'writer', 'commercial', 'main'])
  const firstPublish = f.requests.findIndex((item) => item.path.endsWith('/publish'))
  assert.equal(f.requests.slice(0, firstPublish).filter((item) => item.path.endsWith('/sync-template')).length, 4)
  for (const team of f.teams.values()) {
    assert.equal(team.version, '2')
    assert.equal(team.environmentId, `environment-${team.id}`)
    assert.equal(team.copilotModel.options.temperature, 0.42)
  }
  const writer = f.teams.get('writer')
  assert.equal(writer.graph.nodes.find((node) => node.type === 'xpert').entity.version, '2')
  const receipt = JSON.parse(fs.readFileSync(f.manifest, 'utf8'))
  assert.equal(receipt.readyForTesting, true)
  assert.equal(fs.statSync(f.manifest).mode & 0o777, 0o600)
  assert.doesNotMatch(result.output + fs.readFileSync(f.manifest, 'utf8'), /secret-test-token/)
})

test('installs all Assistants as drafts and publishes each exactly once', async (t) => {
  const f = await fixture(t, { existing: false })
  const result = await run(f.args)
  assert.equal(result.code, 0, result.output)
  assert.equal(f.requests.filter((item) => item.path.endsWith('/install') && item.body.publish === false).length, 4)
  assert.deepEqual(f.published, ['figures', 'writer', 'commercial', 'main'])
})

test('resumes a failed publication without re-syncing or publishing successful roles again', async (t) => {
  const f = await fixture(t)
  f.fail((item) => item.path === '/api/xpert/writer/publish')
  assert.notEqual((await run([...f.args, '--refresh'])).code, 0)
  assert.deepEqual(f.published, ['figures'])
  const syncCount = f.requests.filter((item) => item.path.endsWith('/sync-template')).length
  f.fail(null)
  const resumed = await run([...f.args, '--resume'])
  assert.equal(resumed.code, 0, resumed.output)
  assert.deepEqual(f.published, ['figures', 'writer', 'commercial', 'main'])
  assert.equal(f.requests.filter((item) => item.path.endsWith('/sync-template')).length, syncCount)
})

test('reconciles a committed publication whose response was lost and resumes activation without another version', async (t) => {
  const f = await fixture(t)
  f.afterPublish((item) => item.path === '/api/xpert/figures/publish')
  assert.notEqual((await run([...f.args, '--refresh'])).code, 0)
  f.afterPublish(null)
  const resumed = await run([...f.args, '--resume'])
  assert.equal(resumed.code, 0, resumed.output)
  assert.equal(f.published.filter((id) => id === 'figures').length, 1)
  assert.equal(f.teams.get('figures').version, '2')
  assert.ok(f.requests.some((item) => item.path === '/api/xpert/figures/publication/resume'))
})

test('resumes a failed synchronization while preserving completed drafts', async (t) => {
  const f = await fixture(t)
  f.fail((item) => item.path === '/api/xpert/figures/sync-template')
  assert.notEqual((await run([...f.args, '--refresh'])).code, 0)
  f.fail(null)
  const resumed = await run([...f.args, '--resume'])
  assert.equal(resumed.code, 0, resumed.output)
  assert.equal(f.requests.filter((item) => item.path === '/api/xpert/writer/sync-template').length, 1)
})

test('refuses to resume after an external draft edit or a template change', async (t) => {
  for (const change of ['draft', 'template']) {
    const f = await fixture(t)
    f.fail((item) => item.path === '/api/xpert/figures/publish')
    assert.notEqual((await run([...f.args, '--refresh'])).code, 0)
    f.fail(null)
    if (change === 'draft') f.teams.get('writer').draft.nodes[0].entity.prompt = 'human edit'
    else f.reviseTemplate()
    const offset = f.requests.length
    const resumed = await run([...f.args, '--resume'])
    assert.notEqual(resumed.code, 0)
    assert.equal(
      f.requests.slice(offset).filter((item) => item.method === 'POST' && item.path !== '/api/plugin/by-names').length,
      0
    )
  }
})

test('preflights every target and rejects wrong workspace before any draft mutation', async (t) => {
  const f = await fixture(t)
  f.teams.get('main').workspaceId = 'other-workspace'
  assert.notEqual((await run([...f.args, '--refresh'])).code, 0)
  assert.equal(f.requests.filter((item) => item.path.endsWith('/sync-template')).length, 0)
})

test('uses a previous installation receipt to update exact IDs even after instance renames', async (t) => {
  const f = await fixture(t)
  assert.equal((await run([...f.args, '--refresh'])).code, 0)
  for (const team of f.teams.values()) team.name = `custom-${team.id}`
  const nextManifest = f.manifest + '.next'
  const result = await run([...f.args, '--refresh', '--installation-file', f.manifest, '--manifest-file', nextManifest])
  assert.equal(result.code, 0, result.output)
  assert.equal(f.teams.get('main').version, '3')
})

test('rejects cycles, duplicate edges, and accidental overwrite', async (t) => {
  const f = await fixture(t)
  const collision = await run(f.args)
  assert.notEqual(collision.code, 0)
  assert.match(collision.output, /already exists/)
  f.profile.roles[1].externalRoleKeys = ['writer']
  fs.writeFileSync(f.profilePath, JSON.stringify(f.profile))
  assert.match((await run([...f.args, '--dry-run'])).output, /cycle/)
  f.profile.roles[1].externalRoleKeys = []
  f.profile.orchestrator.externalRoleKeys = ['writer', 'writer']
  fs.writeFileSync(f.profilePath, JSON.stringify(f.profile))
  assert.match((await run([...f.args, '--dry-run'])).output, /Duplicate external/)
})

test('disconnects retired suite roles while retaining their historical Assistants', async (t) => {
  const f = await fixture(t)
  assert.equal((await run([...f.args, '--refresh'])).code, 0)
  f.profile.roles = f.profile.roles.filter((role) => role.key !== 'figures')
  f.profile.roles.find((role) => role.key === 'writer').externalRoleKeys = []
  fs.writeFileSync(f.profilePath, JSON.stringify(f.profile))
  const result = await run([
    ...f.args,
    '--refresh',
    '--installation-file',
    f.manifest,
    '--manifest-file',
    f.manifest + '.retire'
  ])
  assert.equal(result.code, 0, result.output)
  assert.equal(f.teams.get('figures').version, '2')
  assert.equal(
    f.teams.get('writer').graph.nodes.some((node) => node.key === 'figures'),
    false
  )
})

test('rejects a recovery scope mismatch without rewriting its receipt', async (t) => {
  const f = await fixture(t)
  f.fail((item) => item.path === '/api/xpert/figures/publish')
  assert.notEqual((await run([...f.args, '--refresh'])).code, 0)
  const before = fs.readFileSync(f.manifest, 'utf8')
  const resumed = await run([...f.args, '--resume', '--org-id', 'another-org'])
  assert.notEqual(resumed.code, 0)
  assert.equal(fs.readFileSync(f.manifest, 'utf8'), before)
})
