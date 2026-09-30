// Invariants: desktop/package tags never publish platform aliases. Check every
// immutable source before any alias job starts; a tag push can race its publisher.
// Existing complete releases need no publisher run at the platform tag's commit.
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'

const exec = promisify(execFile)
const publisher = 'publish-npm-packages.yml'

export function isPlatformReleaseRef(ref) {
  if (typeof ref !== 'string' || `xpert-${ref.slice('refs/tags/'.length)}`.length > 128) return false
  const match = /^refs\/tags\/v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(ref)
  return Boolean(
    match && (!match[4] || match[4].split('.').every((part) => /^[0-9A-Za-z-]+$/.test(part) && !/^0\d+$/.test(part)))
  )
}

export function releaseSources(matrix) {
  if (!Array.isArray(matrix?.include) || matrix.include.length === 0) {
    throw new Error('Runtime release requires a non-empty image matrix.')
  }
  return [
    ...new Set(
      matrix.include.flatMap((image) => {
        if (!/^[\w][\w.-]{0,127}$/.test(image.versionTag ?? '') || !image.repositories) {
          throw new Error(`Invalid Runtime source metadata for ${image.family}.`)
        }
        const repositories = Object.values(image.repositories)
        if (
          !repositories.length ||
          repositories.some((value) => typeof value !== 'string' || !/^[a-z0-9][a-z0-9./_-]*$/.test(value))
        ) {
          throw new Error(`Invalid Runtime repositories for ${image.family}.`)
        }
        return repositories.map((repository) => `${repository}:${image.versionTag}`)
      })
    )
  ]
}

async function inspectSource(source) {
  try {
    await exec('docker', ['buildx', 'imagetools', 'inspect', source], { timeout: 30_000 })
    return true
  } catch (error) {
    const message = String(error.stderr || error.message).trim()
    if (typeof error.code === 'number' && /\bnot found\b|manifest unknown|MANIFEST_UNKNOWN/i.test(message)) return false
    throw new Error(`Cannot inspect Runtime source ${source}: ${message}`, { cause: error })
  }
}

async function listPublisherRuns(repository, sha) {
  const { stdout } = await exec(
    'gh',
    [
      'api',
      '--paginate',
      '--slurp',
      `repos/${repository}/actions/workflows/${publisher}/runs?head_sha=${sha}&branch=main&per_page=100`
    ],
    { timeout: 30_000 }
  )
  return JSON.parse(stdout).flatMap((page) => page.workflow_runs)
}

export async function waitForRuntimeRelease({
  matrix,
  repository,
  sha,
  inspect = inspectSource,
  listRuns = listPublisherRuns,
  pause = sleep,
  now = Date.now,
  log = console.log,
  timeoutMs = 90 * 60_000,
  pollMs = 30_000
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^[a-f0-9]{40}$/i.test(sha ?? '')) {
    throw new Error('Runtime release requires a GitHub repository and exact commit SHA.')
  }
  const sources = releaseSources(matrix)
  const missingSources = async () => {
    const available = await Promise.all(sources.map(inspect))
    return sources.filter((source, index) => !available[index])
  }
  let missing = await missingSources()
  if (!missing.length) {
    log(`All ${sources.length} immutable Runtime sources are available.`)
    return
  }

  const deadline = now() + timeoutMs
  const describeMissing = () => `Missing Runtime sources:\n${missing.map((source) => `  ${source}`).join('\n')}`
  log(describeMissing())
  let lastStatus
  while (true) {
    const runs = await listRuns(repository, sha)
    const run = runs
      .filter(
        (candidate) =>
          candidate.head_sha === sha &&
          candidate.head_branch === 'main' &&
          ['push', 'workflow_dispatch'].includes(candidate.event)
      )
      .sort((left, right) => right.id - left.id)[0]
    if (!run) {
      throw new Error(
        `No ${publisher} run for main at ${sha}. Publish this Runtime Suite before retrying.\n${describeMissing()}`
      )
    }
    const status = `${run.html_url}: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}`
    if (status !== lastStatus) {
      log(`Runtime publisher ${status}`)
      lastStatus = status
    }
    if (run.status === 'completed') {
      missing = await missingSources()
      if (run.conclusion !== 'success') {
        throw new Error(`Runtime publisher did not succeed: ${status}\n${describeMissing()}`)
      }
      if (missing.length) {
        throw new Error(
          `Runtime publisher completed without all required version tags: ${status}\n${describeMissing()}`
        )
      }
      log(`All ${sources.length} immutable Runtime sources are available after publication.`)
      return
    }
    if (now() >= deadline) {
      throw new Error(`Timed out waiting for Runtime publisher ${status}\n${describeMissing()}`)
    }
    await pause(Math.min(pollMs, deadline - now()))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv[2] === 'check-ref') {
    process.stdout.write(
      `${process.env.GITHUB_EVENT_NAME === 'push' && isPlatformReleaseRef(process.env.GITHUB_REF)}\n`
    )
  } else if (process.argv[2] === 'wait') {
    if (process.env.GITHUB_EVENT_NAME !== 'push' || !isPlatformReleaseRef(process.env.GITHUB_REF)) {
      throw new Error('Runtime aliases require a platform version tag push.')
    }
    await waitForRuntimeRelease({
      matrix: JSON.parse(process.env.RUNTIME_MATRIX),
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA
    })
  } else {
    throw new Error('Usage: runtime-platform-release.mjs <check-ref|wait>')
  }
}
