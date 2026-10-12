const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { packages, forbidden, prepareManifestWorkspace, checkInstalled } = require('./dependencies.cjs')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('Web dependency versions follow the workspace declarations', () => {
  const workspace = JSON.parse(read('package.json'))
  const web = JSON.parse(read('.deploy/webapp/package.json'))
  const declared = { ...workspace.dependencies, ...workspace.devDependencies }
  for (const [name, version] of Object.entries({ ...web.dependencies, ...web.devDependencies })) {
    if (version === 'catalog:') {
      assert.ok(read('pnpm-workspace.yaml').includes(`'${name}':`), `Missing catalog entry: ${name}`)
      continue
    }
    assert.equal(version, declared[name], `${name}: update both manifests and deployment locks`)
  }
  assert.equal(web.packageManager, workspace.packageManager)
})

test('the Web lock contains only the selected frontend workspace importers', () => {
  const lock = read('.deploy/webapp/pnpm-lock.yaml')
  const importers = lock.split('\nimporters:\n')[1].split('\npackages:\n')[0]
  const names = [...importers.matchAll(/^ {2}([^\s].*):$/gm)].map((match) => match[1])
  assert.deepEqual(names.sort(), ['.', ...packages].sort())
})

test('browser audio capture has its runtime and type dependency in the isolated Web workspace', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'web-audio-dependency-test-'))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  prepareManifestWorkspace(temporary)
  const web = JSON.parse(fs.readFileSync(path.join(temporary, 'package.json'), 'utf8'))
  const protocolDirectory = 'packages/desktop-protocol'
  const protocol = JSON.parse(fs.readFileSync(path.join(temporary, protocolDirectory, 'package.json'), 'utf8'))
  assert.equal(web.dependencies[protocol.name], 'workspace:*')
  for (const entry of ['audio-capture.js', 'audio-capture.d.ts']) {
    assert.ok(protocol.files.includes(entry), `${entry} must be shipped with the protocol`)
    assert.ok(fs.existsSync(path.join(root, protocolDirectory, entry)), `Missing browser protocol entry: ${entry}`)
  }
})

test('Docker installs every selected manifest before copying its complete build sources', () => {
  const dockerfile = read('.deploy/webapp/Dockerfile')
  const install = dockerfile.indexOf('RUN pnpm install --frozen-lockfile')
  const build = dockerfile.indexOf('RUN pnpm nx build cloud')
  assert.ok(install >= 0 && build > install)
  for (const directory of packages) {
    const manifest = dockerfile.indexOf(`COPY --chown=node:node ${directory}/package.json ./${directory}/`)
    const source = dockerfile.indexOf(`COPY --chown=node:node ${directory} ./${directory}\n`)
    assert.ok(manifest >= 0 && manifest < install, `${directory}: copy manifest before installation`)
    assert.ok(source > install && source < build, `${directory}: copy sources before compilation`)
  }
})

test('deployment locks keep server native modules out of Web and PTY out of the base API', () => {
  const containsPackage = (lock, name) => new RegExp(`^  ['"]?${name}@`, 'm').test(lock)
  const web = read('.deploy/webapp/pnpm-lock.yaml')
  for (const name of forbidden) assert.equal(containsPackage(web, name), false, `Web includes ${name}`)
  for (const stage of ['build', 'production']) {
    const api = read(`.deploy/api/pnpm-lock.${stage}.yaml`)
    assert.equal(containsPackage(api, 'node-pty'), false, `Base API ${stage} includes node-pty`)
    assert.equal(api.includes('packages/plugins/local-shell-sandbox:'), false)
  }
})

test('manifest preparation does not leak API, Desktop, plugin or source files', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dependencies-test-'))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  prepareManifestWorkspace(temporary)
  assert.equal(fs.readFileSync(path.join(temporary, 'package.json'), 'utf8'), read('.deploy/webapp/package.json'))
  assert.equal(fs.readFileSync(path.join(temporary, 'pnpm-lock.yaml'), 'utf8'), read('.deploy/webapp/pnpm-lock.yaml'))
  for (const dir of packages) assert.deepEqual(fs.readdirSync(path.join(temporary, dir)), ['package.json'])
  for (const dir of ['apps/api', 'apps/desktop', 'packages/server-ai', 'packages/plugin-sdk', 'packages/plugins']) {
    assert.equal(fs.existsSync(path.join(temporary, dir)), false, dir)
  }
})

test('installation check rejects a forbidden dependency', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'web-installed-test-'))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const directory = path.join(temporary, 'node_modules/node-pty')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), '{"name":"node-pty"}')
  assert.throws(() => checkInstalled(temporary), /Web build must not install node-pty/)
})
