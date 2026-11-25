const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { DesktopService } = require('../electron/service.cjs')
const { parseWorkbenchNavigation } = require('../electron/workbench-entry.mjs')
const assistantId = '11111111-1111-4111-8111-111111111111'
const org = '22222222-2222-4222-8222-222222222222'
const project = '33333333-3333-4333-8333-333333333333'
const target = {
  target: 'workbench.view',
  assistantId,
  organizationId: org,
  projectId: null,
  viewKey: 'orders__approval',
  selectionId: 'order-42',
  parameters: { tab: 'evidence', filters: ['open'], page: 2 }
}

const contract = { exports: {} }
runInNewContext(
  ts.transpileModule(
    readFileSync(require.resolve('../../../packages/contracts/src/view-extension/workbench-entry.schema.ts'), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS }
    }
  ).outputText,
  { exports: contract.exports, require }
)

test('generic IPC and shared contract agree on arbitrary View keys and bounded parameters', () => {
  for (const input of [
    target,
    { ...target, viewKey: 'audit__events', selectionId: 'receipt-1', projectId: project },
    { ...target, organizationId: null, parameters: { enabled: true, cleared: null } },
    { ...target, viewKey: '' },
    { ...target, assistantId: '../other' },
    { ...target, url: 'https://example.test' },
    { ...target, commandKey: 'approve' },
    { ...target, projectId: undefined },
    { ...target, organizationId: undefined },
    { ...target, parameters: { nested: { id: 'x' } } },
    { ...target, parameters: { count: Infinity } },
    { ...target, parameters: { huge: 'x'.repeat(4001) } },
    { ...target, parameters: { values: Array(101).fill(1) } },
    { ...target, parameters: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [String(i), i])) }
  ])
    assert.equal(
      !!parseWorkbenchNavigation(input),
      contract.exports.workbenchEntryTargetSchema.safeParse(input).success
    )
})

function fixture(input = target) {
  const calls = []
  let denied = false
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, headers: options.headers, body: options.body && JSON.parse(options.body) })
      if (denied) return Response.json({ message: 'Unavailable' }, { status: 403 })
      return Response.json(
        url.endsWith('/workbench-navigation')
          ? {
              organizationId: input.organizationId,
              projectId: input.projectId,
              assistant: { id: assistantId, name: 'Orders' },
              view: { viewKey: input.viewKey, selectionId: input.selectionId, parameters: input.parameters }
            }
          : { client_secret: 'short-lived' }
      )
    }
  })
  service.profile = { user: { id: 'human', tenantId: 'tenant' }, organizationId: org, organizations: [{ id: org }] }
  service.credentials = { token: 'account-token', tenantId: 'tenant' }
  service.bots = []
  return {
    service,
    calls,
    deny: () => {
      denied = true
    }
  }
}
for (const organizationId of [org, null])
  for (const projectId of [project, null])
    test(`generic View retains scope ${organizationId}/${projectId} through resolution and renewal`, async () => {
      const input = { ...target, organizationId, projectId }
      const f = fixture(input)
      const entry = await f.service.resolveWorkbenchEntry(input)
      assert.equal(entry.assistantId, assistantId)
      assert.deepEqual(entry.parameters, target.parameters)
      assert.equal('secret' in entry, false)
      const request = {
        botId: assistantId,
        target: 'workbench.view',
        source: entry.source,
        sourceAssistantId: entry.assistantId
      }
      const session = await f.service.workbenchSession(request)
      assert.equal(session.projectId, projectId)
      assert.deepEqual(f.calls.at(-1).body, {
        assistant: { id: assistantId },
        ...(projectId ? { project: { id: projectId } } : {})
      })
      for (const call of f.calls) {
        assert.equal(call.headers['organization-id'], organizationId ?? undefined)
        assert.equal(call.headers['x-scope-level'], organizationId ? 'organization' : 'tenant')
        assert.ok(/workbench-navigation$|chatkit\/sessions$/.test(call.url), 'navigation never calls a business action')
      }
      f.deny()
      await assert.rejects(f.service.workbenchSession(request), { status: 403 })
    })
test('unknown scopes and stale account responses cannot open or mint a generic session', async () => {
  const { service, calls } = fixture()
  await assert.rejects(service.resolveWorkbenchEntry({ ...target, organizationId: project }), { status: 403 })
  assert.equal(calls.length, 0)
  const request = service.request.bind(service)
  service.request = async (...args) => {
    const result = await request(...args)
    service.generation++
    return result
  }
  await assert.rejects(service.resolveWorkbenchEntry(target), { status: 409 })
  assert.equal(calls.length, 1)
})
