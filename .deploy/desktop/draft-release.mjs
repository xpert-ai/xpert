// Only verified, complete native builds may be attached to the stable draft.
// Never publish a release or overwrite an existing asset with different content.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { platforms } from './release-plan.mjs'

export function collectAssets(directory, plan) {
  assert.ok(plan.build && plan.stable, 'Only a stable Changesets release can create a draft')
  assert.match(plan.version, /^\d+\.\d+\.\d+$/)
  assert.match(plan.sha, /^[a-f0-9]{40}$/)
  assert.equal(plan.tag, `desktop-v${plan.version}`)
  const assets = [],
    receipts = []
  for (const target of platforms) {
    const receipt = JSON.parse(readFileSync(join(directory, `${target.id}.json`), 'utf8'))
    assert.equal(receipt.target, target.id)
    assert.equal(receipt.version, plan.version)
    assert.equal(receipt.sha, plan.sha)
    assert.ok(['unsigned', 'ad-hoc', 'signed', 'signed-notarized'].includes(receipt.signing))
    const extensions = { mac: ['.dmg', '.zip'], win: ['.exe', '.zip'], linux: ['.AppImage', '.tar.gz'] }[
      target.platform
    ]
    assert.deepEqual(
      receipt.artifacts.map((asset) => asset.file).sort(),
      extensions.map((ext) => `Bosi-${plan.version}-${target.platform}-${target.arch}${ext}`).sort()
    )
    for (const asset of receipt.artifacts) {
      const digest = createHash('sha256')
        .update(readFileSync(join(directory, asset.file)))
        .digest('hex')
      assert.equal(digest, asset.sha256, `Checksum mismatch: ${asset.file}`)
      assets.push(asset)
    }
    receipts.push(receipt)
  }
  const checksums = assets.map(({ file, sha256 }) => `${sha256}  ${file}`).join('\n') + '\n'
  writeFileSync(join(directory, 'SHA256SUMS.txt'), checksums)
  writeFileSync(
    join(directory, 'release-manifest.json'),
    JSON.stringify({ version: plan.version, sha: plan.sha, platforms: receipts }, null, 2) + '\n'
  )
  for (const file of ['SHA256SUMS.txt', 'release-manifest.json'])
    assets.push({
      file,
      sha256: createHash('sha256')
        .update(readFileSync(join(directory, file)))
        .digest('hex')
    })
  const notes = [
    `Bosi ${plan.version}`,
    '',
    `Source: ${plan.sha}`,
    '',
    'All six native targets passed source type checks, applicable unit tests and packaged Electron module/asset checks.',
    '',
    '| Platform | Signing |',
    '| --- | --- |',
    ...receipts.map((receipt) => `| ${receipt.target} | ${receipt.signing} |`),
    '',
    'Review the installers before publishing this draft. Unsigned/ad-hoc builds are test downloads and may require OS security confirmation. Automatic application updates are not configured.',
    '',
    'Checksums and source/signing metadata are attached.'
  ].join('\n')
  return { assets, notes }
}

export function releaseDraft(
  directory,
  plan,
  repository,
  gh = (args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
) {
  assert.equal(repository, 'xpert-ai/xpert', 'Desktop releases belong to the open-source repository')
  const { assets, notes } = collectAssets(directory, plan)
  const notesFile = join(directory, 'release-notes.md')
  writeFileSync(notesFile, notes)
  // The tag lookup endpoint only guarantees published releases; list drafts too.
  const release = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`]))
    .flat()
    .find((entry) => entry.tag_name === plan.tag)
  if (release) {
    assert.equal(release.draft, true, 'Refusing to edit a published release')
    assert.equal(release.target_commitish, plan.sha, 'Draft belongs to a different source commit')
    // Preflight every existing asset before uploading a missing one.
    for (const asset of release.assets) {
      const expected = assets.find((entry) => entry.file === asset.name)
      assert.ok(expected, `Unexpected existing draft asset: ${asset.name}`)
      assert.equal(asset.digest, `sha256:${expected.sha256}`, `Refusing to overwrite ${asset.name}`)
    }
  } else {
    let tag
    try {
      tag = JSON.parse(gh(['api', `repos/${repository}/git/ref/tags/${plan.tag}`]))
    } catch (error) {
      if (!/HTTP 404/.test(String(error.stderr ?? error.message))) throw error
    }
    if (tag) assert.equal(tag.object.sha, plan.sha, 'Existing tag points to a different source commit')
    gh([
      'release',
      'create',
      plan.tag,
      '--repo',
      repository,
      '--draft',
      '--target',
      plan.sha,
      '--title',
      `Bosi ${plan.version}`,
      '--notes-file',
      notesFile
    ])
  }
  const missing = assets.filter((asset) => !release?.assets.some((existing) => existing.name === asset.file))
  for (const asset of missing) gh(['release', 'upload', plan.tag, join(directory, asset.file), '--repo', repository])
  return `https://github.com/${repository}/releases/tag/${plan.tag}`
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    releaseDraft('installers', JSON.parse(process.env.DESKTOP_RELEASE_PLAN ?? '{}'), process.env.GITHUB_REPOSITORY)
  )
}
