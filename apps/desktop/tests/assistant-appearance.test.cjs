const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService, ClientError } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { createAssistantAppearanceMethods } = require('../electron/assistant-appearance.cjs')

function fixture(request) {
  return {
    ...createAssistantAppearanceMethods(ClientError),
    profile: { organizationId: 'org' },
    generation: 1,
    bots: [{ id: 'alias', assistantId: 'assistant' }],
    request,
    clearBotProfile() {}
  }
}

function serviceFixture(fetcher) {
  const service = new DesktopService({ fetcher })
  service.profile = { organizationId: 'org', user: { id: 'user', tenantId: 'tenant' } }
  service.credentials = { token: 'test-access', refreshToken: 'test-refresh', tenantId: 'tenant' }
  service.bots = [{ id: 'alias', assistantId: 'assistant' }]
  return service
}

test('shared avatar uses the actual Assistant and never writes a workflow', async () => {
  const calls = []
  const host = fixture(async (...args) => {
    calls.push(args)
    return { id: 'assistant' }
  })
  const avatar = { url: 'https://files.example/image.png', appearance: { version: 1, kind: 'pet', id: 'boba' } }
  await host.saveAssistantAppearance({ botId: 'alias', revision: 'revision', name: 'Bosi', avatar, draft: {} })
  assert.equal(calls[0][0], '/api/xpert/assistant/appearance')
  assert.deepEqual(calls[0][1].body, { revision: 'revision', name: 'Bosi', avatar })
  assert.throws(() => host.assistantAppearance({ botId: 'unlisted' }), { status: 403 })
})

test('upload checks edit access and file signature before calling storage', async () => {
  const host = fixture(async () => ({ canEdit: false }))
  await assert.rejects(host.uploadAssistantAvatar({ botId: 'alias', data: 'AAAA' }), { status: 403 })
  host.request = async () => ({ canEdit: true })
  await assert.rejects(host.uploadAssistantAvatar({ botId: 'alias', data: 'AAAA' }), /PNG/)
})

test('pet catalog and assets allow new resource IDs without allowing path traversal', async () => {
  const host = fixture(async () => ({}))
  host.config = { frameUrl: 'https://frame.example/chat' }
  const urls = []
  host.fetcher = async (url) => {
    urls.push(url)
    return new Response(
      url.endsWith('catalog.json') ? JSON.stringify([{ id: 'new-pet_2030', label: 'New pet' }]) : 'image'
    )
  }
  assert.deepEqual(await host.assistantPetCatalog({ botId: 'alias' }), [{ id: 'new-pet_2030', label: 'New pet' }])
  assert.ok(
    (await host.assistantPetAsset({ botId: 'alias', petId: 'new-pet_2030' })).src.startsWith('data:image/webp;base64,')
  )
  assert.equal(urls[1], 'https://frame.example/pets/new-pet_2030/spritesheet.webp')
  for (const petId of ['../secret', '//evil', 'a%2fb', 'a?b', 'a#b', 'x'.repeat(101)])
    await assert.rejects(host.assistantPetAsset({ botId: 'alias', petId }))
  assert.equal(urls.length, 2)
})

test('custom pet upload preserves original animation bytes in authorized storage', async () => {
  let uploaded
  const host = fixture(async (path, options) => {
    if (path.endsWith('/appearance')) return { canEdit: true }
    assert.equal(path, '/api/files/upload')
    assert.equal(options.scope, 'organization')
    uploaded = options.body.get('file')
    return {
      destinations: [{ kind: 'storage', metadata: { storageFile: { url: 'https://storage.example/pet.gif' } } }]
    }
  })
  const bytes = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00')
  assert.deepEqual(await host.uploadAssistantPet({ botId: 'alias', data: bytes.toString('base64') }), {
    url: 'https://storage.example/pet.gif'
  })
  assert.equal(uploaded.type, 'image/gif')
  assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()), bytes)
  await assert.rejects(
    host.uploadAssistantPet({ botId: 'alias', data: Buffer.from('<svg onload="evil"/>').toString('base64') }),
    /PNG, WebP or GIF/
  )
  host.request = async () => ({ canEdit: false })
  await assert.rejects(host.uploadAssistantPet({ botId: 'alias', data: bytes.toString('base64') }), { status: 403 })
})

test('avatar upload sends multipart bytes with the current tenant and organization', async () => {
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex')
  let uploads = 0
  const service = serviceFixture(async (url, options) => {
    assert.equal(options.headers['tenant-id'], 'tenant')
    assert.equal(options.headers['organization-id'], 'org')
    assert.equal(options.headers['x-scope-level'], 'organization')
    if (url.endsWith('/appearance')) return new Response(JSON.stringify({ canEdit: true }))
    assert.ok(url.endsWith('/api/files/upload'))
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['Content-Type'], undefined)
    assert.ok(options.body instanceof FormData)
    assert.deepEqual(JSON.parse(options.body.get('targets')), [{ kind: 'storage' }])
    const file = options.body.get('file')
    assert.equal(file.type, 'image/png')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes)
    uploads++
    return new Response(
      JSON.stringify({
        destinations: [{ kind: 'storage', metadata: { storageFile: { url: 'https://files.example/avatar.png' } } }]
      })
    )
  })
  assert.deepEqual(
    await dispatch(service, 'uploadAssistantAvatar', { botId: 'alias', data: bytes.toString('base64') }),
    {
      ok: true,
      value: { url: 'https://files.example/avatar.png' }
    }
  )
  assert.equal(uploads, 1)
})

test('public name saves clear name overrides for aliases while retaining local descriptions', async () => {
  const service = serviceFixture(async (url, options) => {
    assert.ok(url.endsWith('/api/xpert/assistant/appearance'))
    assert.deepEqual(JSON.parse(options.body), { revision: 'revision', name: 'Shared name', avatar: {} })
    return new Response(JSON.stringify({ id: 'assistant' }))
  })
  service.sourceBots = [
    { id: 'assistant', name: 'Original', description: '' },
    { id: 'other', name: 'Other', description: '' }
  ]
  service.bots = service.decorateBots(service.sourceBots)
  for (const bot of service.bots)
    service.editBot({ botId: bot.id, name: `Local ${bot.id}`, description: `Notes ${bot.id}` })
  const copy = service.duplicateBot({ botId: 'assistant', name: 'Local copy' })
  await service.saveAssistantAppearance({ botId: copy.botId, revision: 'revision', name: 'Shared name', avatar: {} })
  const profiles = Object.fromEntries(service.sidebarState().items.map((item) => [item.botId, item.profile]))
  assert.deepEqual(profiles, {
    assistant: { description: 'Notes assistant' },
    [copy.botId]: { description: 'Notes assistant' },
    other: { name: 'Local other', description: 'Notes other' }
  })
  service.editBot({ botId: 'assistant', description: 'Updated notes' })
  assert.deepEqual(service.sidebarState().items.find((item) => item.botId === 'assistant').profile, {
    description: 'Updated notes'
  })
})

test('failed public saves keep local names and do not retry a stale revision', async () => {
  let calls = 0
  const service = serviceFixture(async () => {
    calls++
    return new Response(JSON.stringify({ message: 'The assistant was changed. Reload and retry.' }), { status: 409 })
  })
  service.sourceBots = [{ id: 'alias', name: 'Original', description: '' }]
  service.bots = service.decorateBots(service.sourceBots)
  service.editBot({ botId: 'alias', name: 'Local name', description: 'Notes' })
  await assert.rejects(service.saveAssistantAppearance({ botId: 'alias', revision: 'old', name: 'New', avatar: {} }), {
    status: 409
  })
  assert.equal(calls, 1)
  assert.equal(service.sidebarState().items[0].profile.name, 'Local name')
})

test('only authorized workbench navigation permits appearance access outside the sidebar', async () => {
  const service = serviceFixture(async (url) => {
    if (url.includes('/workbench-navigation'))
      return new Response(
        JSON.stringify({
          conversationId: 'conversation',
          xpertId: 'external',
          threadId: 'thread',
          projectId: null
        })
      )
    if (url.endsWith('/chatkit/sessions')) return new Response(JSON.stringify({ client_secret: 'scoped-session' }))
    assert.ok(url.endsWith('/api/xpert/external/appearance'))
    return new Response(JSON.stringify({ name: 'External', avatar: {}, canEdit: false }))
  })
  assert.throws(() => service.assistantAppearance({ botId: 'external' }), { status: 403 })
  await service.workbenchSession({ botId: 'alias', target: 'assistant.conversation', conversationId: 'conversation' })
  assert.equal((await service.assistantAppearance({ botId: 'external' })).canEdit, false)
  service.generation++
  service.profile.organizationId = 'another'
  assert.throws(() => service.assistantAppearance({ botId: 'external' }), { status: 403 })
})

test('a scope change during permission checks prevents uploading into the next organization', async () => {
  let finish
  const host = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = host.uploadAssistantAvatar({
    botId: 'alias',
    data: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')
  })
  host.generation++
  host.profile.organizationId = 'another'
  host.request = () => assert.fail('Must not upload after a scope change')
  finish({ canEdit: true })
  await assert.rejects(pending, { status: 409 })
})

test('pet catalogs validate extensible IDs and declared sprite versions at the host boundary', async () => {
  const host = fixture(async () => ({}))
  host.config = { frameUrl: 'https://frame.example/chat' }
  for (const catalog of [
    {},
    [{ id: '../bad', label: 'Pet' }],
    [{ id: 'pet', label: 1 }],
    [{ id: 'pet', label: 'Pet', spriteVersionNumber: 3 }]
  ]) {
    host.fetcher = async () => new Response(JSON.stringify(catalog))
    await assert.rejects(host.assistantPetCatalog({ botId: 'alias' }), { status: 502 })
  }
  host.fetcher = async () =>
    new Response(JSON.stringify([{ id: 'future-pet', label: 'Pet', spriteVersionNumber: 2, extra: 'ignored' }]))
  assert.deepEqual(await host.assistantPetCatalog({ botId: 'alias' }), [
    { id: 'future-pet', label: 'Pet', spriteVersionNumber: 2 }
  ])
})

test('pet downloads enforce response limits with and without content-length', async () => {
  const host = fixture(async () => ({}))
  host.config = { frameUrl: 'https://frame.example/chat' }
  host.fetcher = async () => new Response('small', { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } })
  await assert.rejects(host.assistantPetAsset({ botId: 'alias', petId: 'pet' }), { status: 502 })
  let cancelled = false
  host.fetcher = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(256 * 1024 + 1))
        },
        cancel() {
          cancelled = true
        }
      })
    )
  await assert.rejects(host.assistantPetCatalog({ botId: 'alias' }), { status: 502 })
  assert.equal(cancelled, true)
})
