const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { prepareWebRelease } = require('./prepare-web-release.cjs')

test('one identity is shared by compiled Cloud, manifest and both entry pages; each build is unique', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-release-'))
  try {
    for (const [file, value] of Object.entries({
      'apps/cloud/package.json': '{"version":"3.26.2"}',
      'apps/cloud/src/index.html': '<head></head><xp-root></xp-root>',
      'node_modules/@xpert-ai/chatkit-ui/dist/app/index.html':
        '<head><script src="/assets/main-HASH.js"></script></head><div id="root"></div>',
      'node_modules/@xpert-ai/chatkit-ui/dist/app/assets/main-HASH.js': 'window.chatkit=true',
      'node_modules/@xpert-ai/chatkit-ui/dist/app/xpert-web-update.json': '{"schemaVersion":1}',
      '.deploy/webapp/retire-service-worker.js': fs.readFileSync(
        path.join(__dirname, 'retire-service-worker.js'),
        'utf8'
      )
    })) {
      const target = path.join(root, file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, value)
    }
    const first = prepareWebRelease(root)
    const read = (file) => fs.readFileSync(path.join(root, '.cache/web-release', file), 'utf8')
    assert.deepEqual(JSON.parse(read('version.json')), first)
    for (const file of ['version.ts', 'index.html', 'chatkit/index.html']) assert.ok(read(file).includes(first.buildId))
    assert.ok(read('chatkit/index.html').includes('/chatkit/assets/main-HASH.js'))
    assert.equal(read('chatkit/index.html').match(/href="\/assets\/chatkit-icons\/remixicon.css"/g).length, 1)
    assert.equal(read('chatkit/assets/main-HASH.js'), 'window.chatkit=true')
    assert.match(read('ngsw-worker.js'), /unregister/)
    const second = prepareWebRelease(root)
    assert.equal(second.version, first.version)
    assert.notEqual(second.buildId, first.buildId)
    const override = path.join(root, 'local-chatkit')
    fs.mkdirSync(path.join(override, 'assets'), { recursive: true })
    fs.writeFileSync(
      path.join(override, 'index.html'),
      '<head><meta name="xpert-web-build" content="old"><script src="/assets/new-CHUNK.js"></script></head>'
    )
    fs.writeFileSync(path.join(override, 'xpert-web-update.json'), '{"schemaVersion":1}')
    fs.writeFileSync(path.join(override, 'assets/new-CHUNK.js'), 'window.localChatkit=true')
    prepareWebRelease(root, 'local-build', override)
    assert.equal(read('chatkit/assets/new-CHUNK.js'), 'window.localChatkit=true')
    assert.ok(!fs.existsSync(path.join(root, '.cache/web-release/chatkit/assets/main-HASH.js')))
    assert.ok(read('chatkit/index.html').includes('local-build'))
    assert.ok(read('chatkit/index.html').includes('href="/assets/chatkit-icons/remixicon.css"'))
    assert.ok(!read('chatkit/index.html').includes('content="old"'))
    assert.throws(() => prepareWebRelease(root, 'bad', path.join(root, '.cache/web-release/chatkit')), /separate/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('retirement deletes only Angular caches owned by the original scope', async () => {
  const listeners = new Map()
  const removed = []
  let unregistered = false
  const self = {
    registration: {
      scope: 'https://example.test/',
      unregister: async () => {
        unregistered = true
      }
    },
    skipWaiting() {},
    addEventListener: (name, listener) => listeners.set(name, listener)
  }
  const caches = {
    keys: async () => ['ngsw:/:db:control', 'ngsw:/:A:assets', 'ngsw:/other/:assets', 'customer-data', 'chatkit-files'],
    delete: async (name) => {
      removed.push(name)
    }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'retire-service-worker.js'), 'utf8'), { self, caches, URL })
  let done
  listeners.get('activate')({
    waitUntil: (promise) => {
      done = promise
    }
  })
  await done
  assert.deepEqual(removed, ['ngsw:/:db:control', 'ngsw:/:A:assets'])
  assert.equal(unregistered, true)
})
