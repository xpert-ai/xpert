import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const cli = fileURLToPath(new URL('./deploy-archive-plugin.mjs', import.meta.url))

test('publish preserves scoped configuration and verify checks distinct serving replicas', async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), 'plugin-release-test-'))
  t.after(() => rm(tmp, { recursive: true, force: true }))
  const name = '@example/plugin'
  const version = '2.0.0'
  const archivePath = join(tmp, 'release.tgz')
  await mkdir(join(tmp, 'package'))

  async function pack(level) {
    await writeFile(join(tmp, 'package/package.json'), JSON.stringify({ name, version, xpert: { plugin: { level } } }))
    execFileSync('tar', ['-czf', archivePath, '-C', tmp, 'package/package.json'])
    return readFile(archivePath)
  }

  let archive = await pack('tenant')
  let installed = { name, packageName: name, level: 'tenant', installedVersion: '1.0.0', loadStatus: 'loaded' }
  let denied = false
  let uploads = 0
  let tenant = 'test-tenant'
  let secondReady = true
  let invalidDescriptorList = false
  let scope = 'tenant'
  const config = { exampleSetting: 'preserve' }
  const origins = []
  for (const id of ['one', 'two']) {
    const server = createServer(async (req, res) => {
      let status = 200
      let body
      try {
        if (req.url !== '/api/health/ready') {
          assert.equal(req.headers.authorization, 'Bearer test-token')
          assert.equal(req.headers['tenant-id'], 'test-tenant')
          assert.equal(req.headers['x-scope-level'], scope)
          assert.equal(req.headers['organization-id'], scope === 'organization' ? 'test-org' : undefined)
        }
        switch (req.url) {
          case '/api/user/me':
            body = { tenantId: tenant }
            break
          case '/api/plugin/by-names': {
            const items = installed ? [installed] : []
            body = invalidDescriptorList ? {} : id === 'one' ? { items } : items
            break
          }
          case '/api/plugin/configuration':
            body = { pluginName: name, config }
            break
          case '/api/plugin/archive': {
            if (denied) {
              status = 403
              break
            }
            const data = await new Response(req, {
              headers: { 'content-type': req.headers['content-type'] }
            }).formData()
            const file = data.get('file')
            assert.deepEqual(Buffer.from(await file.arrayBuffer()), archive)
            assert.equal(file.name, 'sha256-' + createHash('sha256').update(archive).digest('hex') + '.tgz')
            assert.deepEqual(JSON.parse(data.get('config')), installed ? config : null)
            uploads++
            installed = {
              name,
              level: scope,
              organizationId: req.headers['organization-id'],
              installedVersion: version,
              runningVersion: version,
              loadStatus: 'loaded',
              installation: { method: 'archive', fileName: file.name }
            }
            body = { success: true, packageName: name, currentVersion: version }
            break
          }
          case '/api/health/ready':
            body = { status: id === 'two' && !secondReady ? 'unready' : 'ready', instanceId: id }
            break
          default:
            status = 404
        }
      } catch (error) {
        status = 500
        t.diagnostic(error.message)
      }
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body ?? {}))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise((resolve) => server.close(resolve)))
    origins.push('http://127.0.0.1:' + server.address().port)
  }

  const env = {
    PATH: process.env.PATH,
    XPERT_API_URL: origins[0],
    XPERT_TENANT_ID: 'test-tenant',
    XPERT_TOKEN: 'test-token',
    XPERT_REPLICA_URLS: JSON.stringify(origins),
    XPERT_ORG_ID: 'test-org'
  }
  const command = (action, ...args) => run(process.execPath, [cli, action, archivePath, ...args], { env })
  const output = async (action, ...args) => JSON.parse((await command(action, ...args)).stdout)

  tenant = 'other-tenant'
  await assert.rejects(command('publish'), /Authenticated tenant differs/)
  tenant = 'test-tenant'
  invalidDescriptorList = true
  await assert.rejects(command('publish'), /no descriptor list/)
  assert.equal(uploads, 0)
  invalidDescriptorList = false
  denied = true
  await assert.rejects(command('publish'), /HTTP 403 at .*archive/)
  denied = false
  assert.equal((await output('publish')).registration, 'accepted')
  assert.equal((await output('publish')).registration, 'already present')
  const originalFile = installed.installation.fileName
  installed.installation.fileName = 'different.tgz'
  await assert.rejects(command('publish'), /Use a new version/)
  installed.installation.fileName = originalFile
  assert.equal(uploads, 1)
  assert.equal((await output('verify')).verifiedReplicas, 2)
  env.XPERT_REPLICA_URLS = JSON.stringify([origins[0], origins[0]])
  await assert.rejects(command('verify'), /duplicate instance/)
  env.XPERT_REPLICA_URLS = JSON.stringify(origins)
  secondReady = false
  await assert.rejects(command('verify'), /Replica 2\/2/)
  secondReady = true
  installed.runningVersion = '1.0.0'
  await assert.rejects(command('verify'), /Expected archive is not loaded/)
  installed.runningVersion = version
  const smoke = join(tmp, 'smoke')
  await writeFile(smoke, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  assert.equal((await output('verify', '--smoke-script', smoke)).ingressSmoke, 'passed')
  await writeFile(smoke, '#!/bin/sh\nexit 1\n')
  await assert.rejects(command('verify', '--smoke-script', smoke))

  scope = 'organization'
  archive = await pack(scope)
  installed = undefined
  assert.equal((await output('publish')).scope, 'organization')
  assert.equal((await output('verify')).ingressSmoke, 'not run')
  assert.equal(uploads, 2)
})
