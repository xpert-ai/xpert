const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { menuTemplate } = require('../electron/menu.cjs')
const id = '00000000-0000-4000-8000-000000000001'
const response = (value, status = 200) => new Response(JSON.stringify(value), { status })
function fixture() {
  const calls = []
  const user = { id: 'user', tenantId: 'tenant', name: 'Test' }
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, options })
      if (url.endsWith('/auth/login'))
        return response({ user, token: 'private-access', refreshToken: 'private-refresh' })
      if (url.endsWith('/bootstrap'))
        return response({ user, organizations: [{ id: 'org', name: 'Team' }], activeOrganizationId: 'org' })
      if (url.endsWith('/sessions')) return response({ client_secret: 'cs-x-group', expires_at: 'future' })
      if (url.includes('/groups')) return response({ id, title: 'Design review' })
      throw new Error('Unexpected request')
    }
  })
  return { service, calls }
}
test('group host bridge preserves organization scope and passes only the scoped secret to ChatKit', async () => {
  const { service, calls } = fixture()
  await service.login({ email: 'test@example.com', password: 'fixture' })
  const result = await dispatch(service, 'chatSession', { scope: { kind: 'conversation', conversationId: id } })
  assert.deepEqual(result, { ok: true, value: { secret: 'cs-x-group', organizationId: 'org' } })
  assert.ok(calls.at(-1).url.endsWith('/api/ai/v1/chatkit/sessions'))
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { scope: { kind: 'conversation', conversationId: id } })
  assert.equal(calls.at(-1).options.headers['organization-id'], 'org')
  assert.equal(calls.at(-1).options.headers['tenant-id'], 'tenant')
  assert.equal(calls.at(-1).options.headers['x-scope-level'], 'organization')
  assert.doesNotMatch(JSON.stringify(result), /private-access|private-refresh/)
})
test('group creation uses only the supported title and assistant fields', async () => {
  const { service, calls } = fixture()
  await service.login({ email: 'test@example.com', password: 'fixture' })
  await dispatch(service, 'createGroup', { title: '  Design review  ', assistantId: id, senderId: 'spoof' })
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { title: 'Design review', assistantId: id })
  const count = calls.length
  assert.equal(
    (await dispatch(service, 'chatSession', { scope: { kind: 'conversation', conversationId: '../users' } })).ok,
    false
  )
  assert.equal((await dispatch(service, 'groupPreference', { id, key: 'senderId', value: true })).ok, false)
  assert.equal(calls.length, count)
})
test('native File menu opens the same create dialog through a scoped app event', () => {
  let invoked = 0
  const file = menuTemplate('en', 'darwin', { newGroup: () => invoked++ }).find((item) => item.label === 'File')
  const create = file.submenu.find((item) => item.label === 'New group')
  assert.equal(create.accelerator, 'CmdOrCtrl+Shift+G')
  create.click()
  assert.equal(invoked, 1)
})
