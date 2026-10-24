const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { DesktopService } = require('../electron/service.cjs')

// Exercise the renderer handler together with the real service across the IPC boundary.
const handlerCode = ts.transpileModule(readFileSync(join(__dirname, '../src/workbench.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

function createHandler(service, onSession, desktop, connection) {
  class HostError extends Error {
    constructor(error) {
      super(error.message)
      this.status = error.status
      this.key = error.key
    }
  }
  const exports = {}
  runInNewContext(handlerCode, {
    exports,
    window: { xpertDesktop: desktop },
    require(id) {
      if (id === '@xpert-ai/desktop-protocol') return require('@xpert-ai/desktop-protocol')
      if (id === './host')
        return {
          HostError,
          invoke: async (method, input) => {
            try {
              return await service[method](input)
            } catch (error) {
              throw new HostError(error)
            }
          }
        }
      if (id === '../electron/workbench-platform.mjs') return require('../electron/workbench-platform.mjs')
      throw new Error(`Unexpected import: ${id}`)
    }
  })
  return exports.createWorkbenchHandler('local-copy', 'https://xpert.example', onSession, connection)
}

function fixture() {
  const sessions = []
  const service = new DesktopService({
    fetcher: async (url, options) => {
      if (url.includes('workbench-navigation'))
        return Response.json({
          conversationId: 'conversation-B',
          xpertId: 'assistant-B',
          threadId: 'thread-B',
          projectId: 'project-B'
        })
      const body = JSON.parse(options.body)
      sessions.push(body)
      if (body.project?.id === 'forbidden') return Response.json({ message: 'Forbidden' }, { status: 403 })
      return Response.json({ client_secret: `cs-x-${body.assistant.id}` })
    }
  })
  service.profile = { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org' }
  service.credentials = { token: 'account-token', refreshToken: 'refresh', tenantId: 'tenant' }
  service.bots = [{ id: 'local-copy', assistantId: 'assistant-A' }]
  const changes = []
  return { service, sessions, changes, handle: createHandler(service, (session) => changes.push(session)) }
}

function navigation(payload) {
  return { commandKey: 'workbench.navigation.open', hostType: 'agent', hostId: 'spoofed', viewKey: 'tasks', payload }
}
const conversation = navigation({ target: 'assistant.conversation', conversationId: 'conversation-B' })
const project = navigation({
  target: 'assistant.project',
  projectId: 'project-B',
  assistantId: 'spoofed',
  xpertId: 'spoofed'
})

test('project navigation and refresh retain the host-resolved Assistant after A to B navigation', async () => {
  const { handle, sessions, changes } = fixture()
  const opened = await handle(conversation)
  assert.equal(opened.session.assistantId, 'assistant-B')
  const selected = await handle(project)
  assert.equal(selected.session.assistantId, 'assistant-B')
  assert.equal(selected.session.threadId, null)
  const renewed = await handle(project)
  assert.equal(renewed.session.assistantId, 'assistant-B')
  assert.deepEqual(
    sessions.slice(1),
    Array(2).fill({
      assistant: { id: 'assistant-B' },
      project: { id: 'project-B' }
    })
  )
  assert.equal(changes.length, 2, 'refresh must not reset the current conversation or Shell grant')
})

test('a new host starts with its own Bot even when another host navigated to B', async () => {
  const { handle, service } = fixture()
  await handle(conversation)
  const other = createHandler(service, () => {})
  assert.equal((await other(project)).session.assistantId, 'assistant-A')
  assert.equal((await handle(project)).session.assistantId, 'assistant-B')
})

test('the first Project navigation after restore uses the host current Assistant and still authorizes its binding', async () => {
  const { service, sessions } = fixture()
  const changes = []
  const handle = createHandler(service, (session) => changes.push(session), undefined, {
    assistantId: () => 'restored-role',
    connect: async () => undefined
  })
  const denied = await handle(
    navigation({ target: 'assistant.project', projectId: 'forbidden', assistantId: 'spoofed' })
  )
  assert.equal(denied.success, false)
  assert.equal(changes.length, 0)
  const opened = await handle(project)
  assert.equal(opened.session.assistantId, 'restored-role')
  assert.deepEqual(sessions, [
    { assistant: { id: 'restored-role' }, project: { id: 'forbidden' } },
    { assistant: { id: 'restored-role' }, project: { id: 'project-B' } }
  ])
})

test('project authorization failures do not change the active Assistant or fall back to A', async () => {
  const { handle, sessions, changes } = fixture()
  await handle(conversation)
  const denied = await handle(navigation({ target: 'assistant.project', projectId: 'forbidden' }))
  assert.equal(denied.success, false)
  assert.equal(denied.code, 'forbidden')
  assert.equal(changes.length, 1)
  assert.deepEqual(sessions[1], { assistant: { id: 'assistant-B' }, project: { id: 'forbidden' } })
  assert.equal((await handle(project)).session.assistantId, 'assistant-B')
})

test('generic capture forwarding keeps shell activation separate from plugin payload claims', async () => {
  for (const userActivated of [true, false, undefined]) {
    const received = []
    const handle = createHandler({}, () => {}, {
      audioCapture: async (request) => {
        received.push(request)
        return { success: true, data: { status: 'starting' } }
      }
    })
    const payload = { delivery: { eventAction: 'event', chunkAction: 'chunk' }, userActivated: !userActivated }
    const result = await handle({
      commandKey: 'desktop.audio.capture.start',
      payload,
      userActivated,
      hostType: 'agent',
      hostId: 'assistant',
      viewKey: 'audio-view'
    })
    assert.equal(result.success, true)
    assert.equal(received.length, 1)
    assert.equal(received[0].userActivated, userActivated === true)
    assert.equal(received[0].payload, payload)
    assert.equal(received[0].botId, 'local-copy')
    assert.equal(received[0].viewKey, 'audio-view')
  }
})

test('web-only hosts report the missing Desktop capability and unknown audio commands stay unsupported', async () => {
  const handle = createHandler({}, () => {})
  assert.equal((await handle({ commandKey: 'desktop.audio.capture.start', payload: {} })).code, 'desktop_required')
  assert.equal((await handle({ commandKey: 'desktop.audio.capture.unknown', payload: {} })).code, 'unsupported')
})

const connectCommand = {
  commandKey: 'workspace.connector.connect',
  hostType: 'agent',
  hostId: 'assistant-A',
  viewKey: 'code-review',
  payload: { provider: 'github', assistantId: 'forged', bindingId: 'forged', organizationId: 'forged' }
}

test('provider commands prepare a trusted binding and reuse the connection flow until it finishes', async () => {
  const calls = []
  let complete
  const handle = createHandler(
    {
      preparePluginConnection: async (input) => {
        calls.push(['prepare', input])
        return { success: true, data: { assistantId: 'assistant-A', bindingId: 'binding' } }
      }
    },
    () => {},
    undefined,
    {
      assistantId: () => 'assistant-A',
      connect: (input) => {
        calls.push(['connect', input])
        return new Promise((resolve) => {
          complete = resolve
        })
      }
    }
  )
  let finished = false
  const first = handle(connectCommand).then((result) => {
    finished = true
    return result
  })
  const duplicate = handle(connectCommand)
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(finished, false, 'opening authorization must not report a connected account')
  assert.equal(calls.length, 2, 'duplicate clicks must not create another binding or authorization attempt')
  assert.equal(
    JSON.stringify(calls),
    JSON.stringify([
      ['prepare', { assistantId: 'assistant-A', provider: 'github' }],
      ['connect', { assistantId: 'assistant-A', bindingId: 'binding' }]
    ])
  )
  assert.equal((await handle({ ...connectCommand, payload: { provider: 'another' } })).code, 'connection_in_progress')
  complete({ status: 'connected' })
  assert.equal((await first).data.status, 'connected')
  assert.equal((await duplicate).success, true)
})

test('invalid providers and stale Assistant contexts cannot start authorization', async () => {
  let assistantId = 'assistant-A'
  let resolve
  let connected = false
  const handle = createHandler(
    {
      preparePluginConnection: () =>
        new Promise((done) => {
          resolve = done
        })
    },
    () => {},
    undefined,
    {
      assistantId: () => assistantId,
      connect: async () => {
        connected = true
        return { status: 'connected' }
      }
    }
  )
  assert.equal((await handle({ ...connectCommand, payload: { provider: '../github' } })).code, 'invalid_payload')
  assert.equal((await handle({ ...connectCommand, hostType: 'project' })).code, 'invalid_payload')
  assert.equal((await handle({ ...connectCommand, hostId: 'other' })).code, 'context_changed')
  const pending = handle(connectCommand)
  assistantId = 'other'
  resolve({ success: true, data: { assistantId: 'assistant-A', bindingId: 'binding' } })
  assert.equal((await pending).code, 'context_changed')
  assert.equal(connected, false)
})

test('connection failures retain actionable codes and cancellation never claims success as connected', async () => {
  for (const code of ['connector_not_installed', 'workspace_management_required']) {
    const handle = createHandler(
      { preparePluginConnection: async () => ({ success: false, code }) },
      () => {},
      undefined,
      {
        assistantId: () => 'assistant-A',
        connect: () => assert.fail('must not authorize')
      }
    )
    assert.equal((await handle(connectCommand)).code, code)
  }
  for (const [status, key, code] of [
    [401, undefined, 'authentication_required'],
    [403, undefined, 'forbidden'],
    [408, undefined, 'connection_timeout'],
    [409, undefined, 'context_changed'],
    [502, 'connection_navigation_failed', 'connection_navigation_failed'],
    [500, undefined, 'connection_failed']
  ]) {
    const handle = createHandler(
      {
        preparePluginConnection: async () => {
          throw { status, key, message: 'failure' }
        }
      },
      () => {},
      undefined,
      {
        assistantId: () => 'assistant-A',
        connect: () => assert.fail('must not authorize')
      }
    )
    assert.equal((await handle(connectCommand)).code, code)
  }
  const handle = createHandler(
    {
      preparePluginConnection: async () => ({
        success: true,
        data: { assistantId: 'assistant-A', bindingId: 'binding' }
      })
    },
    () => {},
    undefined,
    {
      assistantId: () => 'assistant-A',
      connect: async () => ({ status: 'cancelled' })
    }
  )
  assert.equal((await handle(connectCommand)).data.status, 'cancelled')
})

test('GitHub button reaches the real host preparation, browser handoff, and verified completion', async (t) => {
  let binding
  let creates = 0
  let active = false
  const calls = []
  const scope = { type: 'workspace', workspaceId: 'workspace' }
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, options })
      assert.equal(options.headers['organization-id'], 'org')
      assert.equal(options.headers['tenant-id'], 'tenant')
      assert.equal(options.headers['x-scope-level'], 'organization')
      if (url.includes('/api/ai/assistants/'))
        return Response.json({
          scope,
          workspaceScope: scope,
          canManageWorkspace: true,
          items: binding
            ? [
                {
                  bindingId: binding.id,
                  provider: 'github',
                  scope,
                  authorizationMode: 'shared',
                  status: active ? 'active' : 'disconnected',
                  granted: active,
                  canManage: true
                }
              ]
            : []
        })
      if (url.includes('/definitions?')) return Response.json([{ provider: 'github' }])
      if (options.method === 'POST') {
        creates++
        binding = { id: 'binding', ...JSON.parse(options.body) }
        return Response.json(binding)
      }
      return Response.json(binding ? [binding] : [])
    }
  })
  service.profile = { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org' }
  service.credentials = { token: 'test-token', tenantId: 'tenant' }
  service.bots = [{ id: 'local-copy', assistantId: 'assistant-A' }]
  const exports = {}
  runInNewContext(
    ts.transpileModule(readFileSync(join(__dirname, '../src/workspace-connection-flow.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    { exports, setTimeout, clearTimeout }
  )
  const opened = []
  let browserOpened
  const opening = new Promise((resolve) => {
    browserOpened = resolve
  })
  const flow = exports.createWorkspaceConnectionFlow({
    assistantId: 'assistant-A',
    start: (request) => service.startPluginConnection(request),
    check: (attemptId) => service.checkPluginConnection({ attemptId }),
    cancel: (attemptId) => service.cancelPluginConnection({ attemptId }),
    open: async (target) => {
      opened.push(require('../electron/workbench-platform.mjs').platformCommandUrl('https://xpert.example', target))
      browserOpened()
    },
    onProgress() {},
    isFatal: () => true,
    invalidRequest: () => new Error('Invalid request')
  })
  t.after(() => flow.cancel())
  const handle = createHandler(service, () => {}, undefined, {
    assistantId: () => 'assistant-A',
    connect: flow.connect
  })
  let finished = false
  const pending = handle(connectCommand).then((result) => {
    finished = true
    return result
  })
  await opening
  assert.equal(finished, false)
  assert.equal(creates, 1)
  const url = new URL(opened[0])
  assert.equal(url.pathname, '/workspace-connection')
  assert.equal(url.searchParams.get('assistantId'), 'assistant-A')
  assert.equal(url.searchParams.get('bindingId'), 'binding')
  assert.equal(url.searchParams.get('organizationId'), 'org')
  await new Promise(setImmediate)
  active = true
  await flow.check()
  const result = await pending
  assert.equal(result.success, true)
  assert.equal(result.data.status, 'connected')
  assert.doesNotMatch(JSON.stringify(result), /test-token|org|binding/)
  assert.equal((await handle(connectCommand)).data.status, 'connected')
  assert.equal(creates, 1)
  assert.equal(opened.length, 1, 'already connected accounts do not open another authorization page')
})
