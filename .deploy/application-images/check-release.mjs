// Invariants: commit checks read only staged blobs and reuse the CI release policy.
// An unreferenced snapshot preserves merge ancestry without changing branches or staged contents.
// Push checks cover the complete update, including commits created by automatic merges.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const zeroSha = /^0{40}$/
const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function resolveCommit(cwd, ref) {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status === 0) return result.stdout.trim()
  if (result.status === 1) return undefined
  throw new Error(result.stderr.trim() || `Cannot resolve ${ref}`)
}

function relevant(files) {
  return files.some(
    (file) =>
      (file.startsWith('.changeset/') && file !== '.changeset/README.md') ||
      /(^|\/)package\.json$/.test(file) ||
      [
        '.deploy/application-images/services.mjs',
        '.deploy/api/dependencies.cjs',
        '.deploy/webapp/dependencies.cjs'
      ].includes(file)
  )
}

async function planner() {
  try {
    return (await import('./release-plan.mjs')).releasePlan
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND')
      throw new Error(
        'Install the release checker dependencies once: npm ci --prefix .deploy/application-images/release-tools --ignore-scripts --no-audit --no-fund',
        { cause: error }
      )
    throw error
  }
}

export async function checkStagedRelease({ cwd = process.cwd() } = {}) {
  const files = git(cwd, 'diff', '--cached', '--name-only', '--no-renames', '-z').split('\0').filter(Boolean)
  if (!relevant(files)) return { skipped: true, reason: 'No staged release metadata changes' }
  const before = resolveCommit(cwd, 'HEAD')
  if (!before) return { skipped: true, reason: 'Initial commit has no release baseline' }
  const releasePlan = await planner()
  const tree = git(cwd, 'write-tree')
  const mergeHead = git(cwd, 'rev-parse', '--git-path', 'MERGE_HEAD')
  let mergeParents = []
  try {
    mergeParents = readFileSync(new URL(mergeHead, pathToFileURL(`${cwd}/`)), 'utf8')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const parent of mergeParents) {
    if (!/^[a-f0-9]{40}$/.test(parent)) throw new Error('Invalid merge parent')
  }
  const parents = [...new Set([before, ...mergeParents])]
  const snapshot = [
    `tree ${tree}`,
    ...parents.map((parent) => `parent ${parent}`),
    'author Xpert release check <release-check@example.invalid> 0 +0000',
    'committer Xpert release check <release-check@example.invalid> 0 +0000',
    '',
    'Validate staged application release metadata',
    ''
  ].join('\n')
  const after = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
    cwd,
    input: snapshot,
    encoding: 'utf8'
  }).trim()
  const branch = git(cwd, 'rev-parse', '--symbolic-full-name', 'HEAD')
  const releaseBranch = ['refs/heads/main', 'refs/heads/develop'].includes(branch)
  const plan = releasePlan({
    cwd,
    before,
    after,
    event: releaseBranch ? 'push' : 'pull_request',
    ref: branch,
    mainSha: resolveCommit(cwd, 'refs/remotes/origin/main') ?? resolveCommit(cwd, 'refs/heads/main')
  })
  return { skipped: false, plan }
}

export async function checkPushReleases(input, { cwd = process.cwd(), remote = 'origin' } = {}) {
  const results = []
  for (const line of input.trim().split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4) throw new Error('Invalid Git pre-push input')
    const [, after, ref, before] = fields
    if (![before, after].every((sha) => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Invalid Git push revision')
    if (!['refs/heads/main', 'refs/heads/develop'].includes(ref) || zeroSha.test(before) || zeroSha.test(after))
      continue
    const files = git(cwd, 'diff', '--name-only', '--no-renames', '-z', before, after).split('\0').filter(Boolean)
    if (!relevant(files)) continue
    const releasePlan = await planner()
    results.push(
      releasePlan({
        cwd,
        before,
        after,
        event: 'push',
        ref,
        mainSha: resolveCommit(cwd, `refs/remotes/${remote}/main`)
      })
    )
  }
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--pre-push') {
      const plans = await checkPushReleases(readFileSync(0, 'utf8'), { remote: process.argv[3] || 'origin' })
      console.log(`Application Changeset push check passed (${plans.length} release updates).`)
    } else if (!process.argv[2] || process.argv[2] === '--staged') {
      const result = await checkStagedRelease()
      console.log(result.skipped ? result.reason : 'Application Changeset staged check passed.')
    } else throw new Error('Usage: node .deploy/application-images/check-release.mjs [--staged | --pre-push <remote>]')
  } catch (error) {
    console.error(`Application Changeset check failed:\n${error.message}`)
    const action = process.argv[2] === '--pre-push' ? 'Commit' : 'Stage'
    console.error(
      `${action} a new Changeset for each required application; working-tree-only fixes and edits to existing notes do not count.`
    )
    process.exitCode = 1
  }
}
