const test = require('node:test')
const assert = require('node:assert/strict')
const { isWorkspaceFileDownload } = require('../electron/workspace-file-download.cjs')

const api = 'https://platform.example/api'
const path =
  '/api/workspace-files/content/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/result.json'

test('keeps only file grants for the configured connection in its session', () => {
  assert.equal(isWorkspaceFileDownload(`https://platform.example${path}`, api), true)
  assert.equal(isWorkspaceFileDownload(`http://localhost:3000${path}`, 'http://localhost:3000'), true)
  for (const url of [
    `https://other.example${path}`,
    `http://platform.example${path}`,
    `https://user:secret@platform.example${path}`,
    `https://platform.example${path}?redirect=https://other.example`,
    `https://platform.example${path}#fragment`,
    'https://platform.example/api/arbitrary',
    'https://platform.example/api/workspace-files/content/invalid/grant/result.json',
    'file:///tmp/result.json',
    'not a URL'
  ])
    assert.equal(isWorkspaceFileDownload(url, api), false)
})

const { mkdtemp, readFile, readdir, rm, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { downloadWorkspaceFile } = require('../electron/workspace-file-download.cjs')
const { DesktopService } = require('../electron/service.cjs')

test('native download streams exact bytes through the authenticated management route', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'view-download-'))
  try {
    const destination = join(directory, 'result.json')
    const service = new DesktopService({
      fetcher: async (url, options) => {
        assert.match(url, /\/api\/workspace-files\/view-sessions\/.*\/grants\/.*\/content\/result.json$/)
        assert.equal(options.headers.Authorization, 'Bearer fixture-token')
        assert.equal(options.headers['organization-id'], 'org-1')
        assert.equal(options.redirect, 'error')
        return new Response(new Uint8Array([0, 1, 255]))
      }
    })
    service.config.apiUrl = api
    service.credentials = { token: 'fixture-token', tenantId: 'tenant-1' }
    service.profile = { organizationId: 'org-1' }
    await downloadWorkspaceFile(`https://platform.example${path}`, service, async () => destination)
    assert.deepEqual(await readFile(destination), Buffer.from([0, 1, 255]))
    assert.deepEqual(await readdir(directory), ['result.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('cancelled and changed sessions do not write; stream failure preserves an existing file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'view-download-'))
  try {
    const destination = join(directory, 'result.json')
    await writeFile(destination, 'original')
    const service = {
      config: { apiUrl: api },
      generation: 1,
      request: async () => {
        throw new Error('request should not run')
      }
    }
    await downloadWorkspaceFile(`https://platform.example${path}`, service, async () => null)
    await assert.rejects(
      downloadWorkspaceFile(`https://platform.example${path}`, service, async () => {
        service.generation++
        return destination
      }),
      /Session changed/
    )
    service.request = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0]))
            controller.error(new Error('interrupted'))
          }
        })
      )
    await assert.rejects(downloadWorkspaceFile(`https://platform.example${path}`, service, async () => destination))
    assert.equal(await readFile(destination, 'utf8'), 'original')
    assert.deepEqual(await readdir(directory), ['result.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
