import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkStorage, configuredStoragePath, parseInventory, persistentMount } from '../check-agent-plugin-storage.mjs'

const dataRoot = '/var/lib/xpert/data'
const root = `${dataRoot}/agent-plugins`
const pkgRoot = `${root}/tenant/org/11111111-1111-4111-8111-111111111111`
const inventory = [{ rootPath: pkgRoot, digest: '55a9f9f88a70dcc44cb4d3a1f0e93af8b9e7cc91ae418511127649fd3eef18a6' }]

test('checks the dataPath default and existing absolute or relative overrides', () => {
  for (const Env of [
    ['IS_DOCKER=true'],
    ['IS_DOCKER=TRUE'],
    ['NODE_ENV=production'],
    ['IS_DOCKER=true', 'XPERT_AGENT_PLUGIN_PATH=']
  ])
    assert.equal(configuredStoragePath({ WorkingDir: '/srv/xpert', Env }), root)
  assert.equal(configuredStoragePath({ WorkingDir: '/other', Env: ['IS_DOCKER=true'] }), root)
  assert.throws(() => configuredStoragePath({ WorkingDir: '/srv/xpert', Env: [] }), /Cannot infer development dataPath/)
  assert.equal(configuredStoragePath({ WorkingDir: '/srv/xpert', Env: [`XPERT_AGENT_PLUGIN_PATH=${root}`] }), root)
  assert.equal(
    configuredStoragePath({ WorkingDir: '/srv/xpert', Env: ['XPERT_AGENT_PLUGIN_PATH=/different'] }),
    '/different'
  )
  assert.equal(
    configuredStoragePath({ WorkingDir: '/srv/xpert', Env: ['XPERT_AGENT_PLUGIN_PATH=packages'] }),
    '/srv/xpert/packages'
  )
})
test('preflight rejects missing, ephemeral, read-only and nested mounts', () => {
  for (const mounts of [
    [],
    [{ Destination: root, Type: 'tmpfs', RW: true }],
    [{ Destination: root, Type: 'bind', RW: false }],
    [
      { Destination: root, Type: 'bind', RW: true },
      { Destination: `${root}/tenant`, Type: 'bind', RW: true }
    ]
  ])
    assert.throws(() => persistentMount(mounts, root))
  assert.equal(
    persistentMount([{ Destination: dataRoot, Type: 'volume', RW: true, Source: '/volume' }], root).type,
    'volume'
  )
})
test('inventory requires exact absolute, scoped, unique paths and SHA-256 identities', () => {
  assert.deepEqual(parseInventory(inventory, root), inventory)
  for (const rows of [
    {},
    [{ rootPath: '/', digest: inventory[0].digest }],
    [{ rootPath: `${root}/../outside`, digest: inventory[0].digest }],
    [{ rootPath: pkgRoot, digest: 'changed' }],
    [...inventory, ...inventory]
  ])
    assert.throws(() => parseInventory(rows, root))
})
test('requires existing database paths to be relocated before switching to data storage', () => {
  assert.throws(
    () =>
      parseInventory(
        [
          {
            ...inventory[0],
            rootPath: '/srv/xpert/storage/agent-plugins/tenant/org/11111111-1111-4111-8111-111111111111'
          }
        ],
        root
      ),
    /inside configured storage/
  )
})
test('preflight refuses partial or duplicate replica inventories before touching Docker', async () => {
  for (const containers of [[], ['a'], ['a', 'a']])
    await assert.rejects(checkStorage({ containers, expectedReplicas: 2, inventory }), /every replica/)
})

test(
  'both Compose variants use the default Agent Plugin path and existing data mount without extra configuration',
  { skip: process.env.XPERT_STORAGE_DOCKER_TEST !== '1' },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'storage-compose-'))
    try {
      for (const file of ['docker-compose.yml', 'docker-compose.cn.yml', 'docker-compose.infra.yml'])
        await copyFile(new URL(`../../../docker/${file}`, import.meta.url), join(dir, file))
      await writeFile(join(dir, '.env'), '')
      for (const file of ['docker-compose.yml', 'docker-compose.cn.yml']) {
        const config = JSON.parse(
          execFileSync(
            'docker',
            ['compose', '-f', join(dir, file), 'config', '--no-env-resolution', '--format', 'json'],
            {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
              env: { ...process.env, API_REPLICAS: '3' }
            }
          )
        )
        assert.equal(config.services.api.deploy.replicas, 3)
        for (const service of [config.services.api, config.services['schema-sync']]) {
          assert.equal(service.environment.XPERT_AGENT_PLUGIN_PATH, undefined)
          assert.equal(
            configuredStoragePath({
              Env: Object.entries(service.environment).map(([key, value]) => `${key}=${value}`)
            }),
            root
          )
          const mount = service.volumes.find((item) => item.target === dataRoot)
          assert.equal(mount.type, 'bind')
          assert.equal(mount.source, join(dir, 'volumes/api/data'))
          assert.equal(
            service.volumes.some((item) => item.target === root || item.target.includes('agent-plugins')),
            false
          )
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)

test(
  'real replicas: visibility, missing/unreadable/corrupt files, read-only mounts and recreation',
  { skip: process.env.XPERT_STORAGE_DOCKER_TEST !== '1', timeout: 180000 },
  async (t) => {
    const prefix = `issue1217-storage-${randomUUID().slice(0, 8)}`
    const containers = [1, 2, 3].map((i) => `${prefix}-${i}`)
    const volumes = [1, 2, 3].map((i) => `${prefix}-vol-${i}`)
    const dir = await mkdtemp(join(tmpdir(), 'storage-receipt-'))
    const receipt = join(dir, 'recreation.json')
    const docker = (...args) =>
      execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    const image = process.env.XPERT_STORAGE_TEST_IMAGE || 'node:22-bookworm'
    const start = (container, volume, readonly = false) =>
      docker(
        'run',
        '--detach',
        '--name',
        container,
        '--network',
        'none',
        '--user',
        '1000:1000',
        '--env',
        'IS_DOCKER=true',
        '--mount',
        `type=volume,source=${volume},target=${dataRoot}${readonly ? ',readonly' : ''}`,
        image,
        'sleep',
        '600'
      )
    const stopAll = () =>
      containers.forEach((container) => {
        try {
          docker('rm', '--force', container)
        } catch {
          /* only test-owned names */
        }
      })
    const edit = (container, code) => docker('exec', '--user', '0:0', container, 'node', '-e', code)
    const fixture = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(dataRoot + '/other-data.txt')},'preserve-other-data');fs.mkdirSync(${JSON.stringify(pkgRoot)},{recursive:true});fs.chownSync(${JSON.stringify(root)},1000,1000);fs.writeFileSync(${JSON.stringify(pkgRoot + '/plugin.json')},'{"name":"example","version":"1.0.0"}')`
    const check = (options = {}) => checkStorage({ containers, expectedReplicas: 3, root, inventory, ...options })
    try {
      for (const volume of volumes) docker('volume', 'create', volume)
      containers.forEach((container, i) => start(container, volumes[i]))
      // All files can match while each replica still has a different filesystem.
      for (const container of containers) edit(container, fixture)
      await t.test('independent persistent volumes fail cross-replica visibility', async () => {
        await assert.rejects(check(), /ENOENT/)
        for (const container of containers)
          assert.equal(
            edit(
              container,
              `console.log(require('node:fs').readdirSync(${JSON.stringify(root)}).filter(x=>x.startsWith('.xpert-storage-probe-')).length)`
            ),
            '0'
          )
      })
      stopAll()
      for (const container of containers) start(container, volumes[0])
      await t.test('one shared data volume verifies all packages and all nine writer/reader pairs', async () => {
        const result = await check()
        assert.equal(result.packageChecks, 3)
        assert.equal(result.crossReplicaChecks, 9)
        assert.equal(result.recreation, 'not-checked')
        console.log('Shared storage:', JSON.stringify(result))
      })
      await t.test('fault categories are preserved under the non-root runtime identity', async () => {
        const file = JSON.stringify(pkgRoot + '/plugin.json')
        edit(containers[0], `require('node:fs').chmodSync(${file},0)`)
        await assert.rejects(check(), /AGENT_PLUGIN_STORAGE_UNREADABLE/)
        edit(
          containers[0],
          `require('node:fs').chmodSync(${file},0o644);require('node:fs').writeFileSync(${file},'corrupt')`
        )
        await assert.rejects(check(), /AGENT_PLUGIN_STORAGE_CORRUPT/)
        edit(containers[0], `require('node:fs').rmSync(${JSON.stringify(pkgRoot)},{recursive:true})`)
        await assert.rejects(check(), /AGENT_PLUGIN_STORAGE_MISSING/)
        edit(containers[0], fixture)
      })
      await t.test('read-only replicas fail before probe writes', async () => {
        docker('rm', '--force', containers[2])
        start(containers[2], volumes[0], true)
        await assert.rejects(check(), /writable persistent/)
        docker('rm', '--force', containers[2])
        start(containers[2], volumes[0])
      })
      await t.test('all package files and probes survive deletion and recreation of every container', async () => {
        await check({ prepareRecreation: receipt })
        const before = JSON.parse(await readFile(receipt, 'utf8'))
        await assert.rejects(check({ verifyRecreation: receipt }), /replacement container IDs/)
        stopAll()
        for (const container of containers) start(container, volumes[0])
        await assert.rejects(check({ inventory: [], verifyRecreation: receipt }), /same database inventory/)
        docker('rm', '--force', containers[2])
        start(containers[2], volumes[1])
        await assert.rejects(check({ verifyRecreation: receipt }), /ENOENT/)
        docker('rm', '--force', containers[2])
        start(containers[2], volumes[0])
        const result = await check({ verifyRecreation: receipt })
        assert.equal(result.recreation, 'verified')
        assert.equal(result.packageChecks, 3)
        for (const container of containers)
          assert.equal(
            before.replicas.some((old) => old.id === docker('inspect', '--format', '{{.Id}}', container)),
            false
          )
        assert.equal(
          edit(
            containers[0],
            `console.log(require('node:fs').readdirSync(${JSON.stringify(root)}).filter(x=>x.startsWith('.xpert-storage-probe-')).length)`
          ),
          '0'
        )
        for (const container of containers)
          assert.equal(
            edit(
              container,
              `console.log(require('node:fs').readFileSync(${JSON.stringify(dataRoot + '/other-data.txt')},'utf8'))`
            ),
            'preserve-other-data'
          )
        console.log('Recreation:', JSON.stringify({ storageRoot: root, mountRoot: dataRoot, ...result }))
      })
    } finally {
      stopAll()
      for (const volume of volumes) {
        try {
          docker('volume', 'rm', volume)
        } catch {
          /* test-owned resources only */
        }
      }
      await rm(dir, { recursive: true, force: true })
    }
  }
)
