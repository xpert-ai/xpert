// Invariants: image releases require new notes or verified Changesets versioning.
// Downstream sync may explicitly retain notes, but can then build candidates only.
// Stable images require complete consumption on main with the exact version bump.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { services } from './services.mjs'
const require = createRequire(new URL('./release-tools/package.json', import.meta.url))
const parse = require('@changesets/parse').default
const semver = require('semver')
const priorities = { patch: 1, minor: 2, major: 3 }
const bump = (version, notes) =>
  semver.inc(
    version,
    notes.reduce((type, note) => (priorities[note.type] > priorities[type] ? note.type : type), 'patch')
  )

export function releasePlan({
  before,
  after,
  event,
  ref,
  cwd = process.cwd(),
  retainedChangesetPolicy = 'reject',
  applicationNames = services.map((service) => service.name)
}) {
  assert.ok(['push', 'pull_request'].includes(event), 'Unsupported application image release event')
  assert.ok(['reject', 'candidate'].includes(retainedChangesetPolicy), 'Unsupported retained Changeset policy')
  const selectedServices = services.filter((service) => applicationNames.includes(service.name))
  assert.ok(
    selectedServices.length > 0 && applicationNames.every((name) => services.some((service) => service.name === name)),
    'Unsupported application image selection'
  )
  const skip = (reason) => ({ build: false, publish: false, reason, matrix: { include: [] } })
  if (event === 'push' && !['refs/heads/develop', 'refs/heads/main'].includes(ref)) return skip('Not a release branch')
  for (const sha of [before, after]) assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'Exact commit SHAs required')
  if (/^0+$/.test(before) || /^0+$/.test(after)) return skip('No release baseline')
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (event === 'pull_request') before = git('merge-base', before, after)
  else git('merge-base', '--is-ancestor', before, after)
  const releasePaths = [
    '.changeset',
    ...new Set(selectedServices.flatMap(({ manifest, shared }) => [manifest, ...shared]))
  ]
  const tree = (sha) => new Set(git('ls-tree', '-r', '--name-only', sha, '--', ...releasePaths).split('\n'))
  const oldTree = tree(before),
    newTree = tree(after)
  const read = (sha, file) => JSON.parse(git('show', `${sha}:${file}`))
  assert.equal(
    read(after, '.changeset/config.json').privatePackages?.version,
    true,
    'Changesets must version private applications'
  )
  const notes = (sha, files) =>
    [...files]
      .filter((file) => /^\.changeset\/[^/]+\.md$/.test(file) && file !== '.changeset/README.md')
      .flatMap((file) =>
        parse(git('show', `${sha}:${file}`))
          .releases.filter((release) => release.type !== 'none')
          .map((release) => {
            assert.ok(Object.hasOwn(priorities, release.type), `Invalid Changeset bump in ${file}`)
            return { file, name: release.name, type: release.type }
          })
      )
  const oldNotes = notes(before, oldTree),
    newNotes = notes(after, newTree)
  const added = new Set(
    git('diff', '--find-renames', '--diff-filter=A', '--name-only', before, after, '--', '.changeset').split('\n')
  )
  const fresh = newNotes.filter((note) => added.has(note.file))
  const include = []
  for (const service of selectedServices) {
    const current = read(after, service.manifest)
    const previous = oldTree.has(service.manifest) ? read(before, service.manifest) : current
    for (const manifest of [previous, current]) {
      assert.equal(manifest.name, service.name)
      assert.equal(manifest.private, true)
      assert.ok(
        semver.valid(manifest.version) && /^\d+\.\d+\.\d+$/.test(manifest.version),
        `Invalid version for ${service.name}`
      )
    }
    const pending = oldNotes.filter((note) => note.name === service.name)
    const remaining = newNotes.filter((note) => note.name === service.name)
    const requested = fresh.filter((note) => note.name === service.name)
    const versioned = current.version !== previous.version
    let baseVersion, evidence
    let retainedForCandidate = false
    if (versioned) {
      // An indirect dependency bump alone does not authorize an image release.
      if (!pending.length) {
        assert.equal(requested.length, 0, `Land ${service.name} Changesets before consuming them`)
        continue
      }
      const consumed = pending.filter((note) => !newTree.has(note.file))
      retainedForCandidate = retainedChangesetPolicy === 'candidate' && consumed.length > 0 && remaining.length > 0
      assert.ok(
        retainedForCandidate || consumed.length === pending.length,
        `${service.name} must consume all pending Changesets`
      )
      assert.equal(
        current.version,
        bump(previous.version, consumed),
        `${service.name} version must match its requested bump`
      )
      baseVersion = retainedForCandidate ? bump(current.version, remaining) : current.version
      evidence = retainedForCandidate ? [...consumed, ...requested] : consumed
    } else {
      if (!requested.length) continue
      baseVersion = bump(current.version, remaining)
      evidence = requested
    }
    const stable = versioned && !retainedForCandidate && event === 'push' && ref === 'refs/heads/main'
    const channel = event === 'pull_request' ? 'pr' : ref === 'refs/heads/main' ? 'main' : 'develop'
    const version = stable ? baseVersion : `${baseVersion}-candidate.${channel}.${after.slice(0, 12)}`
    include.push({
      name: service.name,
      image_name: service.image_name,
      dockerfile: service.dockerfile,
      node_options: service.node_options,
      target: service.image_name === 'xpert-nsjail-runner' ? '' : stable ? 'production' : 'candidate',
      version,
      baseVersion,
      stable,
      versioned,
      tags: [version, `sha-${after}`, ...(stable ? ['main', 'latest'] : [`${channel}-candidate`])]
        .map((value) => `type=raw,value=${value}`)
        .join('\n'),
      changesets: evidence.map((note) => note.file)
    })
  }

  const missing = new Set()
  for (const service of selectedServices) {
    for (const manifest of service.shared) {
      const current = read(after, manifest)
      const newlyDeclared = fresh.some((note) => note.name === current.name)
      const consumed =
        oldTree.has(manifest) &&
        read(before, manifest).version !== current.version &&
        oldNotes.some((note) => note.name === current.name && !newTree.has(note.file))
      if (!newlyDeclared && !consumed) continue
      const image = include.find((entry) => entry.name === service.name)
      if (!image || (consumed && !image.versioned))
        missing.add(
          `${service.name}: ${consumed ? 'consume an application Changeset and bump its version' : 'add an application Changeset'} for ${current.name}`
        )
    }
  }
  assert.equal(missing.size, 0, `Missing application image release declarations:\n${[...missing].join('\n')}`)
  return { build: include.length > 0, publish: event === 'push' && include.length > 0, sha: after, matrix: { include } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = releasePlan({
    before: process.env.IMAGE_RELEASE_BEFORE,
    after: process.env.IMAGE_RELEASE_AFTER,
    event: process.env.IMAGE_RELEASE_EVENT,
    ref: process.env.IMAGE_RELEASE_REF
  })
  console.log(JSON.stringify(plan, null, 2))
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `build=${plan.build}\npublish=${plan.publish}\nmatrix=${JSON.stringify(plan.matrix)}\n`
    )
}
