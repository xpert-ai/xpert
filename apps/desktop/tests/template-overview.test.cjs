const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { projectTemplateOverview } = require('../electron/template-overview.cjs')

const overview = {
  id: '@test/office:main',
  title: 'Office',
  description: 'Office work',
  publisher: 'Author',
  instructions: 'Prepare drafts.',
  memories: [{ title: 'Output', content: 'Draft', secret: 'never-expose' }],
  skills: [{ pluginName: '@test/office', componentKey: 'setup', secret: 'never-expose' }],
  agents: [],
  onboarding: {
    skill: 'setup',
    required: true,
    preferences: ['timezone'],
    completionCriteria: 'Welcome plan',
    secret: 'never-expose'
  },
  routines: [
    {
      key: 'weekly',
      required: false,
      trigger: 'schedule',
      expression: '0 9 * * 1',
      timezone: 'user',
      skill: 'setup',
      output: 'Draft',
      enabled: false
    }
  ],
  integrations: [
    {
      key: 'calendar',
      kind: 'connector',
      label: 'Calendar',
      description: 'Review',
      required: false,
      permissions: ['read'],
      bindingId: 'never-expose'
    }
  ],
  files: { scope: 'user', paths: ['office.md'], contents: 'never-expose' },
  operationPolicy: {
    default: 'approve',
    rules: [{ tool: 'send', decision: 'deny', reason: 'Draft only', secret: 'never-expose' }]
  },
  export_data: 'never-expose'
}
test('overview is a scoped read-only IPC call and strips non-catalog data recursively', async () => {
  const calls = []
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, ...options })
      return new Response(JSON.stringify(overview))
    }
  })
  service.credentials = { token: 'private-token', tenantId: 'tenant' }
  service.profile = { organizationId: 'org' }
  const result = await dispatch(service, 'templateOverview', { id: overview.id })
  assert.equal(result.ok, true)
  assert.equal(result.value.instructions, overview.instructions)
  assert.equal(result.value.routines[0].enabled, false)
  assert.doesNotMatch(JSON.stringify(result), /never-expose|private-token/)
  assert.equal(calls.length, 1)
  assert.equal(new URL(calls[0].url).pathname, '/api/xpert-template/%40test%2Foffice%3Amain/overview')
  assert.equal(calls[0].headers['organization-id'], 'org')
  assert.equal(calls[0].method, 'GET')
})
test('overview rejects malformed shapes and active routine claims', () => {
  for (const bad of [
    null,
    { ...overview, memories: [null] },
    { ...overview, routines: [{ ...overview.routines[0], enabled: true }] },
    { ...overview, integrations: [{ ...overview.integrations[0], kind: 'other' }] }
  ]) {
    assert.throws(() => projectTemplateOverview(bad, Error), /Invalid template overview response/)
  }
})
test('overview requires organization context before any request', async () => {
  const service = new DesktopService({
    fetcher: async () => {
      throw new Error('Must not request')
    }
  })
  await assert.rejects(service.templateOverview({ id: 'office' }), /Select an organization first/)
})
