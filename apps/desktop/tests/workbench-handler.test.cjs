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

function createHandler(service, onSession) {
  class HostError extends Error {
    constructor(error) {
      super(error.message)
      this.status = error.status
    }
  }
  const exports = {}
  runInNewContext(handlerCode, {
    exports,
    require(id) {
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
  return exports.createWorkbenchHandler('local-copy', 'https://xpert.example', onSession)
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
