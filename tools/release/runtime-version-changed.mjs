import { execFileSync } from 'node:child_process'

// Package scripts and dependencies can change before Changesets bumps the version.
// Only a version change authorizes automatic publication of immutable Runtime tags.
const manifestPath = 'packages/sandbox-runtime/package.json'
const event = process.env.RUNTIME_RELEASE_EVENT
if (event === 'workflow_dispatch') {
  process.stdout.write('true\n')
} else if (event === 'push') {
  const before = readVersion(process.env.RUNTIME_RELEASE_BEFORE)
  const after = readVersion(process.env.RUNTIME_RELEASE_AFTER)
  process.stdout.write(`${before !== after}\n`)
} else {
  throw new Error(`Unsupported Runtime release event: ${event}`)
}

function readVersion(revision) {
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/i.test(revision)) {
    throw new Error('Runtime release requires an exact commit SHA.')
  }
  const manifest = JSON.parse(execFileSync('git', ['show', `${revision}:${manifestPath}`], { encoding: 'utf8' }))
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    throw new Error(`Missing Runtime Suite version at ${revision}.`)
  }
  return manifest.version
}
