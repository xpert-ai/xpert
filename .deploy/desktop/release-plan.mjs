// A Desktop changeset requests a candidate. Consuming it on main authorizes a
// stable build; dependency-only version bumps must not accidentally release Bosi.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(new URL('./release-tools/package.json', import.meta.url))
const parse = require('@changesets/parse').default
const semver = require('semver')
export const packageName = '@xpert-ai/desktop'
const manifestPath = 'apps/desktop/package.json'
export const platforms = [
  { id: 'mac-arm64', runner: 'macos-15', platform: 'mac', arch: 'arm64' },
  { id: 'mac-x64', runner: 'macos-15-intel', platform: 'mac', arch: 'x64' },
  { id: 'win-x64', runner: 'windows-2025', platform: 'win', arch: 'x64' },
  { id: 'win-arm64', runner: 'windows-11-arm', platform: 'win', arch: 'arm64' },
  { id: 'linux-x64', runner: 'ubuntu-24.04', platform: 'linux', arch: 'x64' },
  { id: 'linux-arm64', runner: 'ubuntu-24.04-arm', platform: 'linux', arch: 'arm64' }
]
export function releasePlan({ before, after, event, ref, cwd = process.cwd() }) {
  if (!['push', 'pull_request'].includes(event)) throw new Error('Unsupported Desktop release event')
  const skip = (reason) => ({ build: false, reason })
  if (event === 'push' && !['refs/heads/main', 'refs/heads/develop'].includes(ref)) return skip('Not a release branch')
  for (const revision of [before, after])
    if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Exact commit SHAs required')
  if (/^0+$/.test(before) || /^0+$/.test(after)) return skip('No release baseline')
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  if (event === 'pull_request') before = git('merge-base', before, after)
  else git('merge-base', '--is-ancestor', before, after)
  const read = (revision, file) => git('show', `${revision}:${file}`)
  const notes = (revision) =>
    git('ls-tree', '-r', '--name-only', revision, '.changeset')
      .split('\n')
      .filter((file) => /^\.changeset\/[^/]+\.md$/.test(file) && file !== '.changeset/README.md')
      .flatMap((file) =>
        parse(read(revision, file))
          .releases.filter((release) => release.name === packageName && release.type !== 'none')
          .map((release) => ({ file, type: release.type }))
      )
  const oldNotes = notes(before),
    newNotes = notes(after)
  const added = new Set(
    git('diff', '--find-renames', '--diff-filter=A', '--name-only', before, after, '--', '.changeset').split('\n')
  )
  const current = JSON.parse(read(after, manifestPath)),
    previous = JSON.parse(read(before, manifestPath))
  if (
    current.name !== packageName ||
    current.private !== true ||
    !semver.valid(current.version) ||
    semver.prerelease(current.version)
  )
    throw new Error('Invalid Desktop package manifest')
  if (!JSON.parse(read(after, '.changeset/config.json')).privatePackages?.version)
    throw new Error('Changesets must version private packages')
  const priorities = { patch: 1, minor: 2, major: 3 }
  const bump = (version, pending) =>
    semver.inc(
      version,
      pending.reduce((highest, note) => (priorities[note.type] > priorities[highest] ? note.type : highest), 'patch')
    )
  const bumped = current.version !== previous.version
  let baseVersion, evidence
  if (bumped) {
    if (!oldNotes.length) return skip('No Desktop changeset: dependency-only or unrequested version bump')
    if (
      oldNotes.some((note) => newNotes.some((current) => current.file === note.file)) ||
      bump(previous.version, oldNotes) !== current.version
    )
      throw new Error('Desktop version must consume its changesets and match the requested bump')
    baseVersion = current.version
    evidence = oldNotes.map((note) => note.file)
  } else {
    evidence = newNotes.filter((note) => added.has(note.file)).map((note) => note.file)
    if (!evidence.length) return skip('No new Desktop changeset')
    baseVersion = bump(current.version, newNotes)
  }
  const stable = bumped && event === 'push' && ref === 'refs/heads/main'
  const branch = ref === 'refs/heads/main' ? 'main' : 'develop'
  const version = stable ? baseVersion : `${baseVersion}-candidate.${branch}.${after.slice(0, 12)}`
  return {
    build: true,
    stable,
    version,
    baseVersion,
    sha: after,
    tag: `desktop-v${version}`,
    changesets: evidence,
    matrix: { include: platforms }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = releasePlan({
    before: process.env.DESKTOP_RELEASE_BEFORE,
    after: process.env.DESKTOP_RELEASE_AFTER,
    event: process.env.DESKTOP_RELEASE_EVENT,
    ref: process.env.DESKTOP_RELEASE_REF
  })
  console.log(JSON.stringify(plan))
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `build=${plan.build}\nstable=${Boolean(plan.stable)}\nplan=${JSON.stringify(plan)}\nmatrix=${JSON.stringify(plan.matrix ?? { include: [] })}\nversion=${plan.version ?? ''}\n`
    )
}
