const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('node:os')
const { test } = require('node:test')
const { preparePets } = require('./prepare-chatkit-pets.cjs')

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'xpert-pets-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}
function pack(root, directory, label = 'Boba') {
  const source = path.join(root, directory)
  mkdirSync(path.join(source, 'boba'), { recursive: true })
  writeFileSync(path.join(source, 'catalog.json'), JSON.stringify([{ id: 'boba', label }]))
  writeFileSync(path.join(source, 'boba/pet.json'), JSON.stringify({ id: 'boba' }))
  writeFileSync(path.join(source, 'boba/spritesheet.webp'), Buffer.from([82, 73, 70, 70, 0, 255]))
  return source
}
test('provisions an extracted offline pack with byte-identical images', (t) => {
  const root = fixture(t)
  const source = pack(root, '.deploy/webapp/pet-assets/pets')
  const result = preparePets({ root })
  assert.equal(result.count, 1)
  assert.deepEqual(
    readFileSync(path.join(result.destination, 'boba/spritesheet.webp')),
    readFileSync(path.join(source, 'boba/spritesheet.webp'))
  )
})
test('prefers an installed independent package over the legacy UI assets', (t) => {
  const root = fixture(t)
  pack(root, 'node_modules/@xpert-ai/chatkit-ui/dist/app/pets', 'Legacy')
  pack(root, 'node_modules/@xpert-ai/chatkit-assets/pets', 'Offline')
  writeFileSync(
    path.join(root, 'node_modules/@xpert-ai/chatkit-assets/package.json'),
    JSON.stringify({ name: '@xpert-ai/chatkit-assets' })
  )
  const result = preparePets({ root })
  assert.equal(JSON.parse(readFileSync(path.join(result.destination, 'catalog.json')))[0].label, 'Offline')
})
test('supports existing UI deployments and explicit source overrides', (t) => {
  const root = fixture(t)
  pack(root, 'node_modules/@xpert-ai/chatkit-ui/dist/app/pets')
  assert.equal(preparePets({ root }).count, 1)
  const source = pack(root, 'custom/pets', 'Custom')
  assert.equal(preparePets({ root, source }).source, source)
  assert.throws(() => preparePets({ root, source: 'missing' }), /Missing offline/)
})
test('resolves the Cloud build dependency when the UI package has no pet files', (t) => {
  const root = fixture(t)
  const directory = 'apps/cloud/node_modules/@xpert-ai/chatkit-assets'
  const source = pack(root, `${directory}/pets`)
  writeFileSync(
    path.join(root, directory, 'package.json'),
    JSON.stringify({ name: '@xpert-ai/chatkit-assets', version: '0.1.0' })
  )
  assert.equal(preparePets({ root }).source, realpathSync(source))
})
test('fails builds with missing or incomplete offline assets', (t) => {
  const root = fixture(t)
  assert.throws(() => preparePets({ root }), /Missing offline/)
  const source = pack(root, 'custom/pets')
  preparePets({ root, source })
  rmSync(path.join(source, 'boba/spritesheet.webp'))
  assert.throws(() => preparePets({ root, source }))
})
test('Nx and Docker prepare pets independently and Nginx serves real files', () => {
  const root = path.resolve(__dirname, '../..')
  const project = JSON.parse(readFileSync(path.join(root, 'apps/cloud/project.json')))
  assert.ok(project.targets.build.dependsOn.includes('prepare-chatkit-pets'))
  assert.ok(project.targets.serve.dependsOn.includes('prepare-chatkit-pets'))
  assert.ok(
    project.targets.build.options.assets.some(
      (asset) => asset.input === '.cache/chatkit-pets' && asset.output === './pets'
    )
  )
  const docker = readFileSync(path.join(__dirname, 'Dockerfile'), 'utf8')
  assert.ok(
    docker.indexOf('COPY --chown=node:node .deploy/webapp/pet-assets') < docker.indexOf('RUN pnpm nx build cloud')
  )
  for (const name of ['prod', 'compose']) {
    const config = readFileSync(path.join(__dirname, `nginx.${name}.conf`), 'utf8')
    assert.match(config, /location \^~ \/pets\/ \{\s+root \/srv\/xpert;\s+try_files \$uri =404;/)
  }
})
