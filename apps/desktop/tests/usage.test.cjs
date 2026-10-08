const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { usageFixture, organizationId } = require('./fixtures/usage.cjs')
const range = { start: '2026-09-27T00:00:00.000Z', end: '2026-10-03T23:59:59.999Z' }
function service(fetcher) {
  const instance = new DesktopService({
    fetcher: fetcher || (async (url) => new Response(JSON.stringify(usageFixture(url))))
  })
  instance.credentials = { token: 'fixture', tenantId: 'fixture-tenant', organizationId }
  instance.profile = { user: { id: 'fixture-user' }, organizationId, organizations: [{ id: organizationId }] }
  return instance
}
test('usage endpoints keep identity and organization in the host and narrow personal statistics by organization', async () => {
  const calls = []
  const host = service(async (url, options) => {
    calls.push(new URL(url))
    assert.equal(options.headers['organization-id'], organizationId)
    assert.equal(options.headers['tenant-id'], 'fixture-tenant')
    assert.equal(options.headers['x-scope-level'], 'organization')
    assert.equal(options.method, 'GET')
    return new Response(JSON.stringify(usageFixture(url)))
  })
  const membership = await dispatch(host, 'usageMembership')
  assert.equal(membership.ok, true)
  assert.equal(membership.value.pointsRemaining, 15310)
  assert.equal(membership.value.personalPointsBalance, 6800)
  await host.usagePeriods()
  await host.usageOverview(range)
  const summaries = await host.usageSummaries({ ...range, take: 10, skip: 0 })
  const entries = await host.usageEntries({ ...range, group: summaries.items[0].group, take: 20, skip: 0 })
  assert.equal(entries.items.length, 2)
  for (const url of calls.slice(2)) assert.equal(url.searchParams.get('organizationId'), organizationId)
  assert.equal(JSON.stringify(membership).includes('fixture-tenant'), false)
})
test('foreign scope, identity and invalid paging cannot reach the API', async () => {
  let calls = 0
  const host = service(async () => {
    calls++
    throw new Error('unexpected call')
  })
  for (const input of [
    { ...range, organizationId: 'foreign' },
    { ...range, userId: 'other' },
    { ...range, take: 1000 },
    { ...range, skip: -1 },
    { ...range, start: range.end, end: range.start }
  ])
    await assert.rejects(host.usageSummaries(input), { status: 400 })
  host.profile.organizationId = 'foreign'
  await assert.rejects(host.usageMembership(), { status: 409 })
  assert.equal(calls, 0)
})
test('missing identity and server denials stay errors, never zero usage', async () => {
  const host = service(async () => new Response('{}', { status: 403 }))
  await assert.rejects(host.usageOverview(range), { status: 403 })
  host.credentials = null
  await assert.rejects(host.usageMembership(), { status: 401 })
})
test('unlimited allowance and no membership remain distinct from zero', async () => {
  for (const scenario of ['unlimited', 'no-plan']) {
    const host = service(async (url) => new Response(JSON.stringify(usageFixture(url, scenario))))
    const me = await host.usageMembership()
    if (scenario === 'unlimited') assert.equal(me.pointsRemaining, null)
    else assert.equal(me, null)
  }
})
test('malformed amounts fail instead of presenting a fabricated balance', async () => {
  const host = service(
    async (url) => new Response(JSON.stringify({ ...usageFixture(url), pointsRemaining: 'unknown' }))
  )
  await assert.rejects(host.usageMembership(), { status: 502 })
})
test('summary pagination and exact model filters preserve backend totals', async () => {
  const host = service()
  const second = await host.usageSummaries({ ...range, take: 10, skip: 10 })
  assert.equal(second.total, 13)
  assert.equal(second.items.length, 3)
  const filtered = await host.usageSummaries({ ...range, model: 'gpt-4.1-mini', take: 10, skip: 0 })
  assert.ok(filtered.items.every((row) => row.group.model === 'gpt-4.1-mini'))
})
test('null dimensions cannot blend another conversation into detail records; raw pages remain navigable', async () => {
  const group = {
    usageHour: null,
    usageChannel: null,
    provider: null,
    model: 'gpt-4.1',
    organizationId,
    xpertId: null,
    threadId: null,
    copilotId: null
  }
  const host = service(
    async () =>
      new Response(
        JSON.stringify({
          total: 3,
          items: [
            { ...group, id: 'matched', createdAt: range.start, pointsDelta: -2, tokenUsed: 5, source: 'usage' },
            {
              ...group,
              id: 'other',
              threadId: 'different-thread',
              createdAt: range.start,
              pointsDelta: -99,
              tokenUsed: 100,
              source: 'usage'
            }
          ]
        })
      )
  )
  const result = await host.usageEntries({ ...range, group, take: 2, skip: 0 })
  assert.deepEqual(
    result.items.map((item) => item.id),
    ['matched']
  )
  assert.equal(result.nextSkip, 2)
  await assert.rejects(host.usageEntries({ ...range, group: { ...group, organizationId: 'other' } }), { status: 400 })
})
test('a response from a previous organization is rejected by the existing session generation', async () => {
  let resolve
  const host = service(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const result = host.usageOverview(range)
  host.generation++
  resolve(new Response(JSON.stringify(usageFixture('/api/membership/me/overview'))))
  await assert.rejects(result, { status: 409 })
})
