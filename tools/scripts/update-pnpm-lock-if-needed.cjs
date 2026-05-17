#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process')

const lockfilePath = 'pnpm-lock.yaml'
const watchedFiles = new Set(['.npmrc', 'pnpm-workspace.yaml'])
const manifestFields = [
  'name',
  'version',
  'packageManager',
  'workspaces',
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundleDependencies',
  'bundledDependencies',
  'overrides',
  'resolutions',
  'pnpm'
]

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  })
}

function gitShow(revision, filePath) {
  try {
    return git(['show', `${revision}:${filePath}`])
  } catch {
    return null
  }
}

function readManifest(revision, filePath) {
  const content = gitShow(revision, filePath)

  if (content === null) {
    return null
  }

  try {
    return JSON.parse(content)
  } catch {
    return { __unparseable: content }
  }
}

function normalize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce((normalized, key) => {
      normalized[key] = normalize(value[key])
      return normalized
    }, {})
}

function pickManifestFields(manifest) {
  if (manifest === null) {
    return null
  }

  return manifestFields.reduce((picked, field) => {
    if (Object.prototype.hasOwnProperty.call(manifest, field)) {
      picked[field] = normalize(manifest[field])
    }

    return picked
  }, {})
}

function hasRelevantManifestChange(filePath) {
  const oldFields = pickManifestFields(readManifest('HEAD', filePath))
  const stagedFields = pickManifestFields(readManifest('', filePath))

  return JSON.stringify(oldFields) !== JSON.stringify(stagedFields)
}

const stagedFiles = git(['diff', '--cached', '--name-only', '--diff-filter=ACMRD']).split(/\r?\n/).filter(Boolean)

const shouldUpdateLockfile = stagedFiles.some((filePath) => {
  if (watchedFiles.has(filePath)) {
    return true
  }

  return filePath.endsWith('/package.json') || filePath === 'package.json' ? hasRelevantManifestChange(filePath) : false
})

if (!shouldUpdateLockfile) {
  process.exit(0)
}

console.log('Dependency metadata changed; updating pnpm-lock.yaml...')

const installResult = spawnSync('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
  stdio: 'inherit'
})

if (installResult.error) {
  console.error(`Failed to run pnpm: ${installResult.error.message}`)
  process.exit(1)
}

if (installResult.status !== 0) {
  process.exit(installResult.status || 1)
}

const lockfileStatus = git(['status', '--short', '--', lockfilePath]).trim()

if (lockfileStatus) {
  git(['add', lockfilePath], { stdio: 'inherit' })
  console.log('Updated and staged pnpm-lock.yaml.')
} else {
  console.log('pnpm-lock.yaml is already up to date.')
}
