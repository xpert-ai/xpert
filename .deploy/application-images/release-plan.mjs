// Invariants: pending application notes authorize candidates for relevant fixes.
// Downstream sync may explicitly retain notes, but can then build candidates only.
// Aggregated syncs must verify hidden note consumption at every source version commit.
// Versions adopted from newly merged main histories are candidate baselines only.
// Stable images require complete consumption on main with the exact version bump.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { affectsImage, requiresImageRelease, services } from './services.mjs'
import { fixedVersions } from './fixed-versions.mjs'
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
  mainSha,
  upstreamMainSha,
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
  const skip = (reason) => ({
    build: false,
    publish: false,
    validate: false,
    reason,
    matrix: { include: [] },
    validationMatrix: { include: [] }
  })
  if (event === 'push' && !['refs/heads/develop', 'refs/heads/main'].includes(ref)) return skip('Not a release branch')
  for (const sha of [before, after]) assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'Exact commit SHAs required')
  if (/^0+$/.test(before) || /^0+$/.test(after)) return skip('No release baseline')
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (event === 'pull_request') before = git('merge-base', before, after)
  else git('merge-base', '--is-ancestor', before, after)
  const changedFiles = git('diff', '--no-renames', '--name-only', '-z', before, after).split('\0').filter(Boolean)
  const releasePaths = ['.changeset', ...new Set(services.flatMap(({ manifest, shared }) => [manifest, ...shared]))]
  const tree = (sha) => new Set(git('ls-tree', '-r', '--name-only', sha, '--', ...releasePaths).split('\n'))
  const oldTree = tree(before),
    newTree = tree(after)
  const read = (sha, file) => JSON.parse(git('show', `${sha}:${file}`))
  const mergedBaselines = []
  const addMergedBaseline = (sha) => {
    const ancestor = git('merge-base', sha, after)
    const fork = git('merge-base', before, ancestor)
    if (fork !== ancestor) mergedBaselines.push({ sha: ancestor, files: tree(ancestor), fork, forkFiles: tree(fork) })
  }
  if (mainSha !== undefined) {
    assert.match(mainSha, /^[a-f0-9]{40}$/, 'Exact main commit SHA required')
    if (event === 'pull_request' || ref === 'refs/heads/develop') addMergedBaseline(mainSha)
  }
  if (upstreamMainSha !== undefined) {
    assert.match(upstreamMainSha, /^[a-f0-9]{40}$/, 'Exact upstream main commit SHA required')
    assert.equal(retainedChangesetPolicy, 'candidate', 'Upstream main baselines require candidate retention')
    // Downstream main also adopts upstream versions without authorizing stable tags.
    addMergedBaseline(upstreamMainSha)
  }
  const adoptedBaselineVersion = (manifest, previous, current) =>
    semver.gt(current, previous) &&
    mergedBaselines.some(({ sha, files }) => files.has(manifest) && read(sha, manifest).version === current)
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
  const fixed = fixedVersions({
    before,
    after,
    read,
    manifests: [...new Set(services.flatMap((service) => [service.manifest, ...service.shared]))].filter(
      (file) => oldTree.has(file) && newTree.has(file)
    ),
    oldNotes,
    newNotes,
    adoptedVersion: (name) =>
      mergedBaselines
        .flatMap(({ sha, files }) => {
          const manifest = [...files].find((file) => file.endsWith('/package.json') && read(sha, file).name === name)
          return manifest ? [read(sha, manifest).version] : []
        })
        .sort(semver.rcompare)[0],
    adoptedNote: (file) =>
      !newTree.has(file) &&
      mergedBaselines.some(
        ({ files, fork, forkFiles }) =>
          forkFiles.has(file) && !files.has(file) && git('show', `${fork}:${file}`) === git('show', `${before}:${file}`)
      ),
    unchangedNote: (file) => newTree.has(file) && git('show', `${before}:${file}`) === git('show', `${after}:${file}`)
  })
  const plannedVersion = (name, version, notes, phase, retainedForCandidate = false) => {
    const basis = fixed.basis(name, phase, notes, retainedForCandidate)
    return bump(basis?.version ?? version, basis?.notes ?? notes)
  }
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
    const versioned =
      current.version !== previous.version &&
      !adoptedBaselineVersion(service.manifest, previous.version, current.version) &&
      !fixed.alignment(service.name)
    let baseVersion, evidence
    let retainedForCandidate = false
    if (versioned) {
      const consumed = pending.filter((note) => !newTree.has(note.file))
      retainedForCandidate = retainedChangesetPolicy === 'candidate' && consumed.length > 0 && remaining.length > 0
      const snapshotMatches =
        consumed.length > 0 &&
        (retainedForCandidate || consumed.length === pending.length) &&
        current.version === bump(previous.version, consumed)
      const merged =
        retainedChangesetPolicy === 'candidate' && remaining.length > 0 && !snapshotMatches
          ? mergedVersioning({ git, read, service, previous, current, before, after, cwd, applicationNames })
          : undefined
      if (merged) {
        retainedForCandidate = true
        baseVersion = plannedVersion(service.name, current.version, remaining, 'after')
        evidence = [...merged.changesets, ...requested.map((note) => note.file)]
      } else {
        // An indirect dependency bump alone does not authorize an image release.
        if (!pending.length) {
          assert.equal(requested.length, 0, `Land ${service.name} Changesets before consuming them`)
          continue
        }
        assert.ok(
          retainedForCandidate || consumed.length === pending.length,
          `${service.name} must consume all pending Changesets`
        )
        assert.equal(
          current.version,
          plannedVersion(service.name, previous.version, consumed, 'before', retainedForCandidate),
          `${service.name} version must match its requested bump`
        )
        baseVersion = retainedForCandidate
          ? plannedVersion(service.name, current.version, remaining, 'after')
          : current.version
        evidence = (retainedForCandidate ? [...consumed, ...requested] : consumed).map((note) => note.file)
      }
    } else {
      if (!requested.length && !(remaining.length && affectsImage(service, changedFiles))) continue
      baseVersion = plannedVersion(service.name, current.version, remaining, 'after')
      evidence = (requested.length ? requested : remaining).map((note) => note.file)
    }
    const stable = versioned && !retainedForCandidate && event === 'push' && ref === 'refs/heads/main'
    const channel = event === 'pull_request' ? 'pr' : ref === 'refs/heads/main' ? 'main' : 'develop'
    const version = stable ? baseVersion : `${baseVersion}-candidate.${channel}.${after.slice(0, 12)}`
    include.push({
      name: service.name,
      image_name: service.image_name,
      dockerfile: service.dockerfile,
      node_options: service.node_options,
      health_check: service.health_check,
      target: service.image_name === 'xpert-nsjail-runner' ? '' : stable ? 'production' : 'candidate',
      version,
      baseVersion,
      stable,
      versioned,
      tags: [version, `sha-${after}`, ...(stable ? ['main', 'latest'] : [`${channel}-candidate`])]
        .map((value) => `type=raw,value=${value}`)
        .join('\n'),
      changesets: [...new Set(evidence)]
    })
  }

  const missing = new Set()
  for (const service of selectedServices) {
    if (requiresImageRelease(service, changedFiles) && !include.some((image) => image.name === service.name))
      missing.add(`${service.name}: add an application Changeset for changed image runtime inputs`)
    for (const manifest of service.shared) {
      const current = read(after, manifest)
      const newlyDeclared = fresh.some((note) => note.name === current.name)
      const consumed =
        oldTree.has(manifest) &&
        read(before, manifest).version !== current.version &&
        !adoptedBaselineVersion(manifest, read(before, manifest).version, current.version) &&
        oldNotes.some((note) => note.name === current.name && !newTree.has(note.file))
      if (!newlyDeclared && !consumed) continue
      const image = include.find((entry) => entry.name === service.name)
      if (
        !image ||
        (newlyDeclared && !fresh.some((note) => note.name === service.name)) ||
        (consumed && !image.versioned)
      )
        missing.add(
          `${service.name}: ${consumed ? 'consume an application Changeset and bump its version' : 'add an application Changeset'} for ${current.name}`
        )
    }
  }
  assert.equal(missing.size, 0, `Missing application image release declarations:\n${[...missing].join('\n')}`)
  const validation = selectedServices.flatMap((service) => {
    const release = include.find((image) => image.name === service.name)
    if (!release && !affectsImage(service, changedFiles)) return []
    return [
      {
        ...(release ?? {
          name: service.name,
          image_name: service.image_name,
          dockerfile: service.dockerfile,
          node_options: service.node_options,
          health_check: service.health_check,
          target: service.image_name === 'xpert-nsjail-runner' ? '' : 'production',
          version: read(after, service.manifest).version
        }),
        publish: event === 'push' && Boolean(release)
      }
    ]
  })
  return {
    build: include.length > 0,
    publish: event === 'push' && include.length > 0,
    validate: validation.length > 0,
    sha: after,
    matrix: { include },
    validationMatrix: { include: validation }
  }
}

function mergedVersioning({ git, read, service, previous, current, before, after, cwd, applicationNames }) {
  // A merge can hide notes added and consumed between the compared snapshots.
  // Walk a continuous ancestor chain and apply the strict gate to each release.
  let tip = after,
    version = current.version
  const changesets = []
  while (version !== previous.version) {
    const commits = git('log', '--format=%H', '--no-merges', `${before}..${tip}`, '--', service.manifest)
    let transition
    for (const commit of commits.split('\n').filter(Boolean)) {
      if (read(commit, service.manifest).version !== version) continue
      const parent = git('rev-parse', `${commit}^`)
      if (parent === before && tip === after) continue
      const parentVersion = read(parent, service.manifest).version
      if (!semver.lt(parentVersion, version) || semver.lt(parentVersion, previous.version)) continue
      const plan = releasePlan({
        cwd,
        before: parent,
        after: commit,
        event: 'pull_request',
        applicationNames
      })
      const image = plan.matrix.include.find((entry) => entry.name === service.name && entry.versioned)
      if (!image) continue
      changesets.unshift(...image.changesets)
      transition = { parent, version: parentVersion }
      break
    }
    if (!transition) return
    tip = transition.parent
    version = transition.version
  }
  return { changesets }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = releasePlan({
    before: process.env.IMAGE_RELEASE_BEFORE,
    after: process.env.IMAGE_RELEASE_AFTER,
    event: process.env.IMAGE_RELEASE_EVENT,
    ref: process.env.IMAGE_RELEASE_REF,
    mainSha: process.env.IMAGE_RELEASE_MAIN
  })
  console.log(JSON.stringify(plan, null, 2))
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `build=${plan.build}\npublish=${plan.publish}\nmatrix=${JSON.stringify(plan.matrix)}\n` +
        `validate=${plan.validate}\nsha=${plan.sha ?? ''}\nvalidation_matrix=${JSON.stringify(plan.validationMatrix)}\n` +
        `validate_api=${plan.validationMatrix.include.some((image) => image.image_name === 'xpert-api')}\n` +
        `validate_web=${plan.validationMatrix.include.some((image) => image.image_name === 'xpert-webapp')}\n`
    )
}
