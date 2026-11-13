const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')

test('skills use the selected workspace and return a public installation receipt', async () => {
  const service = new DesktopService()
  const organizationId = randomUUID(),
    workspaceId = randomUUID(),
    id = randomUUID()
  service.profile = { organizationId }
  const target = { organizationId, workspaceId }
  const calls = []
  service.request = async (path, options) => {
    calls.push({ path, options })
    if (path.startsWith('/api/skill-repository-indexes?')) return { total: 1, items: [{ id, name: 'Review' }] }
    if (path.includes('/by-workspace/')) return { items: [{ skillIndexId: id }] }
    if (path.endsWith('/install')) return { id: randomUUID(), workspaceId, skillIndexId: id, instructions: 'private' }
    return { items: [] }
  }
  assert.equal(
    (await dispatch(service, 'skillCatalog', { ...target, offset: 0, search: 'review' })).value.items[0].installed,
    true
  )
  assert.deepEqual((await dispatch(service, 'installWorkspaceSkill', { ...target, indexId: id })).value, {
    installed: true
  })
  assert.ok(calls.every(({ options }) => options.scope === 'organization'))
  assert.equal(calls[2].path, '/api/skill-package/workspace/' + workspaceId + '/install')
  assert.deepEqual(calls[2].options.body, { indexId: id })
  assert.equal(
    (await dispatch(service, 'installWorkspaceSkill', { ...target, organizationId: randomUUID() })).status,
    409
  )
  assert.equal((await dispatch(service, 'installWorkspaceSkill', { ...target, workspaceId: '' })).status, 400)
  assert.equal(calls.length, 3)
  const unscoped = await dispatch(service, 'skillCatalog', { organizationId, workspaceId: '', offset: 0, search: '' })
  assert.equal(unscoped.value.items[0].installed, null)
  assert.equal(calls.length, 4, 'browsing the skill index does not query workspace installations')
})
