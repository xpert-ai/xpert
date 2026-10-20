// Fixed groups coordinate version arithmetic, not release authorization. Baseline
// alignment retains pending notes and can only produce candidates; stable releases
// still require each application's previously landed notes to be consumed.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(new URL('./release-tools/package.json', import.meta.url))
const semver = require('semver')

export function fixedVersions({
  before,
  after,
  read,
  manifests,
  oldNotes,
  newNotes,
  unchangedNote,
  adoptedVersion = () => undefined,
  adoptedNote = () => false
}) {
  const oldGroups = read(before, '.changeset/config.json').fixed ?? []
  const newGroups = read(after, '.changeset/config.json').fixed ?? []
  const groupFor = (groups, name) => groups.find((group) => group.includes(name))
  const inventory = (sha) =>
    new Map(
      manifests.map((file) => {
        const pkg = read(sha, file)
        return [pkg.name, pkg]
      })
    )
  // Resolve only groups touching the image dependency profiles. Independent
  // release lines remain outside the image planner's version policy.
  const oldPackages = newGroups.length || oldGroups.length ? inventory(before) : new Map()
  const newPackages = newGroups.length || oldGroups.length ? inventory(after) : new Map()
  const highest = (group, packages) => {
    const versions = group.map((name) => {
      const version = packages.get(name)?.version
      assert.ok(semver.valid(version), `Unknown or invalid fixed-group package: ${name}`)
      return version
    })
    return versions.sort(semver.rcompare)[0]
  }
  const groupNotes = (group, notes) => notes.filter((note) => group.includes(note.name))
  return {
    alignment(name) {
      const group = groupFor(newGroups, name)
      if (!group || groupFor(oldGroups, name)) return false
      // A single push may contain both a main sync and the initial alignment.
      // Only versions from the caller's verified newly merged ancestor qualify.
      const baseline = [highest(group, oldPackages), ...group.map(adoptedVersion).filter(Boolean)].sort(
        semver.rcompare
      )[0]
      if (!group.every((member) => newPackages.get(member)?.version === baseline)) return false
      if (!group.every((member) => semver.major(oldPackages.get(member).version) === semver.major(baseline)))
        return false
      return groupNotes(group, oldNotes).every((note) => unchangedNote(note.file) || adoptedNote(note.file))
    },
    basis(name, phase, notes, retainedForCandidate = false) {
      const groups = phase === 'before' ? oldGroups : newGroups
      const group = groupFor(groups, name)
      if (!group) return undefined
      const packages = phase === 'before' ? oldPackages : newPackages
      const version = highest(group, packages)
      assert.ok(
        group.every((member) => newPackages.get(member)?.version === newPackages.get(name)?.version),
        `Fixed group containing ${name} must use the same version`
      )
      if (phase === 'before' && !retainedForCandidate) {
        assert.ok(
          groupNotes(group, oldNotes).every((note) => !newNotes.some((next) => next.file === note.file)),
          `Fixed group containing ${name} must consume all pending Changesets`
        )
      }
      const available = phase === 'before' ? oldNotes : newNotes
      const files = new Set(notes.map((note) => note.file))
      const relevant =
        phase === 'before'
          ? available.filter((note) => files.has(note.file) || !newNotes.some((next) => next.file === note.file))
          : available
      return { version, notes: groupNotes(group, relevant) }
    }
  }
}
