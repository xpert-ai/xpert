import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { platforms } from './release-plan.mjs'
import { collectAssets, releaseDraft } from './draft-release.mjs'
const plan = { build: true, stable: true, version: '0.1.1', sha: 'b'.repeat(40), tag: 'desktop-v0.1.1' }
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'bosi-installers-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  for (const target of platforms) {
    const artifacts = { mac: ['.dmg', '.zip'], win: ['.exe', '.zip'], linux: ['.AppImage', '.tar.gz'] }[
      target.platform
    ].map((extension) => {
      const file = `Bosi-${plan.version}-${target.platform}-${target.arch}${extension}`
      writeFileSync(path.join(directory, file), file)
      return { file, sha256: createHash('sha256').update(file).digest('hex') }
    })
    writeFileSync(
      path.join(directory, `${target.id}.json`),
      JSON.stringify({ version: plan.version, sha: plan.sha, target: target.id, signing: 'unsigned', artifacts })
    )
  }
  return directory
}
test('all six native targets and both installer formats are required and checksummed', (t) => {
  const directory = fixture(t),
    { assets, notes } = collectAssets(directory, plan)
  assert.equal(assets.length, 18)
  assert.ok(notes.includes('unsigned'))
  assert.equal(readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').length, 16)
  rmSync(path.join(directory, 'win-arm64.json'))
  assert.throws(() => collectAssets(directory, plan), /ENOENT/)
})
test('corrupt installers or another commit cannot enter the draft', (t) => {
  const directory = fixture(t)
  assert.throws(() => collectAssets(directory, { ...plan, sha: 'c'.repeat(40) }))
  writeFileSync(path.join(directory, 'Bosi-0.1.1-win-x64.exe'), 'corrupt')
  assert.throws(() => collectAssets(directory, plan), /Checksum mismatch/)
  assert.throws(() => collectAssets(directory, { ...plan, stable: false }), /Only a stable/)
})
test('new release is always a draft pinned to the verified commit', (t) => {
  const directory = fixture(t),
    calls = []
  releaseDraft(directory, plan, 'xpert-ai/xpert', (args) => {
    calls.push(args)
    if (args[0] === 'api' && args[1] === '--paginate') return '[[]]'
    if (args[0] === 'api') throw new Error('HTTP 404')
    return ''
  })
  const create = calls.find((args) => args[1] === 'create')
  assert.ok(create.includes('--draft'))
  assert.ok(create.includes(plan.sha))
  assert.equal(calls.filter((args) => args[1] === 'upload').length, 18)
  assert.ok(!calls.some((args) => args.includes('--clobber')))
})
test('published releases, tag collisions and registry read failures cannot be overwritten', (t) => {
  const directory = fixture(t)
  assert.throws(
    () =>
      releaseDraft(directory, plan, 'xpert-ai/xpert', () => JSON.stringify([[{ tag_name: plan.tag, draft: false }]])),
    /published/
  )
  assert.throws(
    () =>
      releaseDraft(directory, plan, 'xpert-ai/xpert', (args) =>
        args[1] === '--paginate' ? '[[]]' : JSON.stringify({ object: { sha: 'wrong' } })
      ),
    /different source/
  )
  assert.throws(
    () =>
      releaseDraft(directory, plan, 'xpert-ai/xpert', () => {
        throw new Error('HTTP 403')
      }),
    /403/
  )
})
test('identical draft assets resume without upload; changed ones fail before any write', (t) => {
  const directory = fixture(t),
    { assets } = collectAssets(directory, plan)
  const draft = {
    tag_name: plan.tag,
    draft: true,
    target_commitish: plan.sha,
    assets: assets.map((asset) => ({ name: asset.file, digest: `sha256:${asset.sha256}` }))
  }
  const calls = []
  const gh = (args) => {
    calls.push(args)
    return JSON.stringify([[draft]])
  }
  releaseDraft(directory, plan, 'xpert-ai/xpert', gh)
  assert.equal(calls.length, 1)
  draft.assets[0].digest = 'sha256:different'
  assert.throws(() => releaseDraft(directory, plan, 'xpert-ai/xpert', gh), /Refusing to overwrite/)
  assert.ok(calls.every((args) => args[0] === 'api'))
})
test('update feeds use SHA-512 of the matching installer and exclude unsigned macOS', (t) => {
  const directory = fixture(t)
  let result = collectAssets(directory, plan)
  assert.ok(!result.assets.some((asset) => asset.file.endsWith('-mac.yml')))
  for (const target of platforms.filter((target) => target.platform === 'mac')) {
    const filename = path.join(directory, `${target.id}.json`)
    const receipt = JSON.parse(readFileSync(filename, 'utf8'))
    receipt.signing = 'signed-notarized'
    writeFileSync(filename, JSON.stringify(receipt))
  }
  result = collectAssets(directory, plan)
  assert.equal(result.assets.length, 20)
  for (const asset of result.assets.filter((asset) => asset.file.endsWith('.yml'))) {
    const metadata = JSON.parse(readFileSync(path.join(directory, asset.file), 'utf8'))
    const installer = readFileSync(path.join(directory, metadata.path))
    assert.equal(metadata.version, plan.version)
    assert.equal(metadata.sha512, createHash('sha512').update(installer).digest('base64'))
    assert.deepEqual(metadata.files, [{ url: metadata.path, sha512: metadata.sha512, size: installer.length }])
  }
})
