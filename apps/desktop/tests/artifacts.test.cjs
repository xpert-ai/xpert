const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')

const attachment = {
  artifactId: 'artifact-1',
  artifactVersionId: 'version-1',
  sha256: 'a'.repeat(64),
  mimeType: 'image/png'
}
const previewLink = () => ({
  artifactId: attachment.artifactId,
  version: { id: attachment.artifactVersionId, sha256: attachment.sha256, mimeType: attachment.mimeType },
  publicUrl: 'https://api.example.com/api/artifacts/public/image?xpert_artifact_preview=short-lived',
  expiresAt: new Date(Date.now() + 300_000).toISOString()
})
const response = (value, status = 200) => new Response(JSON.stringify(value), { status })

function fixture(override) {
  const calls = []
  const link = previewLink()
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, options })
      return (await override?.(url, options)) || response(link)
    }
  })
  service.credentials = { token: 'account-private', refreshToken: 'refresh-private', tenantId: 'tenant-1' }
  service.profile = { organizationId: 'org-1', organizations: [{ id: 'org-1' }, { id: 'org-2' }] }
  return { service, calls, link }
}

test('preview dispatch pins the image version and returns only a short-lived URL with organization scope', async () => {
  const { service, calls, link } = fixture()
  const result = await dispatch(service, 'toolOutputPreview', attachment)
  assert.deepEqual(result, { ok: true, value: { previewUrl: link.publicUrl, expiresAt: link.expiresAt } })
  assert.doesNotMatch(JSON.stringify(result), /account-private|refresh-private/)
  const { url, options } = calls[0]
  assert.equal(url, 'http://localhost:3000/api/artifacts/artifact-1/links/signed-preview')
  assert.equal(options.method, 'POST')
  assert.equal(options.headers.Authorization, 'Bearer account-private')
  assert.equal(options.headers['tenant-id'], 'tenant-1')
  assert.equal(options.headers['organization-id'], 'org-1')
  assert.equal(options.headers['x-scope-level'], 'organization')
  assert.equal(options.redirect, 'error')
  assert.deepEqual(JSON.parse(options.body), {
    artifactVersionId: 'version-1',
    versionMode: 'version',
    ttlSeconds: 300,
    presentation: { disposition: 'inline', allowDownload: false }
  })
})

test('preview requires sign-in and an active organization before requesting a link', async () => {
  const { service, calls } = fixture()
  service.profile = null
  await assert.rejects(service.toolOutputPreview(attachment), { status: 403 })
  service.logout()
  await assert.rejects(service.toolOutputPreview(attachment), { status: 401 })
  assert.equal(calls.length, 0)
})

test('invalid attachments cannot turn the preview method into arbitrary HTTP access', async () => {
  const { service, calls } = fixture()
  for (const input of [
    null,
    {},
    { ...attachment, artifactId: '../user' },
    { ...attachment, artifactId: 'https://example.com' },
    { ...attachment, artifactVersionId: '' },
    { ...attachment, artifactVersionId: 'v'.repeat(257) },
    { ...attachment, sha256: 'not-a-checksum' },
    { ...attachment, mimeType: 'image/svg+xml' }
  ]) {
    await assert.rejects(service.toolOutputPreview(input), { status: 400 })
  }
  assert.equal(calls.length, 0)
})

test('a mismatched artifact, version, hash or image type cannot be shown as the requested screenshot', async () => {
  const link = previewLink()
  for (const invalid of [
    { ...link, artifactId: 'other-artifact' },
    { ...link, version: { ...link.version, id: 'latest-version' } },
    { ...link, version: { ...link.version, sha256: 'b'.repeat(64) } },
    { ...link, version: { ...link.version, sha256: null } },
    { ...link, version: { ...link.version, mimeType: 'text/html' } },
    { ...link, version: null }
  ]) {
    const { service } = fixture(() => response(invalid))
    await assert.rejects(service.toolOutputPreview(attachment), { status: 502 })
  }
})

test('expired, invalid and non-web preview URLs are rejected', async () => {
  const link = previewLink()
  for (const invalid of [
    { ...link, publicUrl: 'file:///tmp/private' },
    { ...link, publicUrl: 'data:image/png;base64,abcd' },
    { ...link, publicUrl: '/relative/url' },
    { ...link, publicUrl: 'https://user:password@example.com/image' },
    { ...link, expiresAt: new Date(Date.now() - 1000).toISOString() },
    { ...link, expiresAt: 'not-a-date' },
    { ...link, expiresAt: null }
  ]) {
    const { service } = fixture(() => response(invalid))
    await assert.rejects(service.toolOutputPreview(attachment), { status: 502 })
  }
})

test('preview retries resolve a fresh link; signed URLs are not cached in the host', async () => {
  let attempt = 0
  const { service } = fixture(() =>
    response({ ...previewLink(), publicUrl: `https://example.com/image?ticket=${++attempt}` })
  )
  const first = await service.toolOutputPreview(attachment)
  const second = await service.toolOutputPreview(attachment)
  assert.notEqual(first.previewUrl, second.previewUrl)
})

test('token refresh preserves the preview request and organization scope', async () => {
  const { service, calls } = fixture((url, options) => {
    if (url.endsWith('/auth/refresh')) return response({ token: 'new-private', refreshToken: 'new-refresh-private' })
    if (options.headers.Authorization === 'Bearer account-private') return response({}, 401)
  })
  await service.toolOutputPreview(attachment)
  assert.equal(calls.length, 3)
  assert.equal(calls[2].options.headers.Authorization, 'Bearer new-private')
  assert.equal(calls[2].options.headers['x-scope-level'], 'organization')
  assert.equal(calls[2].options.headers['organization-id'], 'org-1')
  assert.equal(calls[2].options.body, calls[0].options.body)
})

test('a denied artifact never falls back to another scope or version', async () => {
  const { service, calls } = fixture(() => response({}, 403))
  const result = await dispatch(service, 'toolOutputPreview', attachment)
  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(calls.length, 1)
})

test('a preview arriving after logout or an organization switch is discarded', async () => {
  for (const change of [(service) => service.logout(), (service) => service.selectOrganization('org-2')]) {
    let finish
    const { service } = fixture(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const pending = service.toolOutputPreview(attachment)
    await change(service)
    finish(response(previewLink()))
    await assert.rejects(pending, { status: 409 })
  }
})

const deliveredBytes = Buffer.from('test document content')
const deliveredHash = require('node:crypto').createHash('sha256').update(deliveredBytes).digest('hex')
const delivered = { artifactId: 'artifact-1', artifactVersionId: 'version-1' }
const documentLink = () => ({
  ...previewLink(),
  version: {
    ...previewLink().version,
    fileName: 'result.docx',
    size: deliveredBytes.length,
    sha256: deliveredHash,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
})

test('file delivery resolves the saved version, not the latest artifact, without returning account credentials', async () => {
  const link = documentLink()
  const { service, calls } = fixture((url) =>
    url.endsWith('signed-preview') ? response(link) : new Response(deliveredBytes)
  )
  const result = await dispatch(service, 'deliveredFilePreview', delivered)
  assert.equal(result.ok, true)
  assert.equal(result.value.name, 'result.docx')
  assert.equal(result.value.sha256, deliveredHash)
  assert.equal(result.value.size, deliveredBytes.length)
  assert.equal(result.value.base64, deliveredBytes.toString('base64'))
  assert.equal(calls[1].options.headers, undefined)
  assert.equal(calls[1].options.redirect, 'error')
  assert.doesNotMatch(JSON.stringify(result), /account-private|refresh-private/)
  assert.equal(calls[0].options.headers['x-scope-level'], 'organization')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    artifactVersionId: 'version-1',
    versionMode: 'version',
    ttlSeconds: 300,
    presentation: { disposition: 'inline', allowDownload: true }
  })
})

test('file delivery rejects invalid IDs, unpinned versions and untrusted metadata', async () => {
  const { service, calls } = fixture()
  for (const input of [null, {}, { artifactId: 'a' }, { ...delivered, artifactId: '../a' }])
    await assert.rejects(service.deliveredFilePreview(input), { status: 400 })
  assert.equal(calls.length, 0)
  const link = documentLink()
  for (const invalid of [
    { ...link, artifactId: 'other' },
    { ...link, version: { ...link.version, id: 'latest' } },
    { ...link, version: { ...link.version, sha256: 'unknown' } },
    { ...link, version: { ...link.version, size: 65 * 1024 * 1024 } },
    { ...link, publicUrl: 'file:///etc/passwd' },
    { ...link, expiresAt: 'invalid' }
  ]) {
    const { service } = fixture(() => response(invalid))
    await assert.rejects(service.deliveredFilePreview(delivered), { status: 502 })
  }
})

test('denied deliveries and results from an old organization do not fall back to another file', async () => {
  const denied = fixture(() => response({}, 403))
  await assert.rejects(denied.service.deliveredFilePreview(delivered), { status: 403 })
  assert.equal(denied.calls.length, 1)
  let finish
  const { service } = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = service.deliveredFilePreview(delivered)
  await service.selectOrganization('org-2')
  finish(response(documentLink()))
  await assert.rejects(pending, { status: 409 })
})

test('file delivery checks downloaded content and discards files after an organization switch', async () => {
  for (const bytes of [Buffer.from('different'), Buffer.alloc(deliveredBytes.length + 1)]) {
    const { service } = fixture((url) =>
      url.endsWith('signed-preview') ? response(documentLink()) : new Response(bytes)
    )
    await assert.rejects(service.deliveredFilePreview(delivered), { status: 502 })
  }
  let finish
  const { service } = fixture((url) =>
    url.endsWith('signed-preview')
      ? response(documentLink())
      : new Promise((resolve) => {
          finish = resolve
        })
  )
  const pending = service.deliveredFilePreview(delivered)
  while (!finish) await new Promise((resolve) => setImmediate(resolve))
  await service.selectOrganization('org-2')
  finish(new Response(deliveredBytes))
  await assert.rejects(pending, { status: 409 })
})
