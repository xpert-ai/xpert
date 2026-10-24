// All resolutions and frozen checks finish outside the checkout before any lock
// is replaced. Ordinary installs and commit hooks never call this registry updater.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getPackages } from '@manypkg/get-packages'
import { parse, stringify } from 'yaml'
import { chatkitPackages, selectVersions, validateCompatibility, validateLock } from './chatkit-locks.mjs'

const require = createRequire(import.meta.url)
const api = require('../../.deploy/api/dependencies.cjs')
const web = require('../../.deploy/webapp/dependencies.cjs')
const desktop = require('../../.deploy/desktop/dependencies.cjs')
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function runPnpm(args, cwd, capture = false) {
  const result = spawnSync(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm', ...args], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, CI: 'true' }
  })
  if (result.error) throw result.error
  // Registry output may contain connection details; never include it in errors.
  if (result.status !== 0) throw new Error(`pnpm ${args[0]} failed (${result.status}); no source locks updated`)
  return result.stdout
}

function copy(root, destination, file) {
  mkdirSync(path.dirname(path.join(destination, file)), { recursive: true })
  copyFileSync(path.join(root, file), path.join(destination, file))
}

export async function profilesFor(root) {
  const workspace = await getPackages(root)
  const manifests = workspace.packages.map((pkg) => path.relative(root, path.join(pkg.dir, 'package.json')))
  const sourceFiles = [
    'package.json',
    'pnpm-workspace.yaml',
    '.npmrc',
    ...manifests,
    '.deploy/api/package.json',
    '.deploy/api/package-prod.json',
    '.deploy/webapp/package.json',
    '.deploy/desktop/package.json'
  ]
  return {
    sourceFiles,
    profiles: [
      {
        lock: 'pnpm-lock.yaml',
        prepare(destination) {
          for (const file of ['package.json', 'pnpm-workspace.yaml', '.npmrc', 'pnpm-lock.yaml', ...manifests])
            copy(root, destination, file)
        }
      },
      ...['build', 'production'].map((stage) => ({
        lock: `.deploy/api/pnpm-lock.${stage}.yaml`,
        prepare: (destination) => api.prepareManifestWorkspace(stage, destination, root)
      })),
      {
        lock: '.deploy/webapp/pnpm-lock.yaml',
        prepare: (destination) => web.prepareManifestWorkspace(destination, root)
      },
      { lock: '.deploy/desktop/pnpm-lock.yaml', prepare: (destination) => desktop.prepare(destination, false, root) }
    ]
  }
}

export async function updateChatkit({ root = repository, run = runPnpm, setup = profilesFor } = {}) {
  const { profiles, sourceFiles } = await setup(root)
  const files = [...new Set([...sourceFiles, ...profiles.map((profile) => profile.lock)])]
  const originals = new Map(files.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]))
  const workspaceText = originals.get('pnpm-workspace.yaml')
  const workspace = parse(workspaceText)
  const published = Object.fromEntries(
    chatkitPackages.map((name) => {
      const value = JSON.parse(run(['view', name, 'versions', '--json'], root, true))
      return [name, typeof value === 'string' ? [value] : value]
    })
  )
  const versions = selectVersions(workspace.catalog, published)
  const metadata = Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [
      name,
      JSON.parse(run(['view', `${name}@${version}`, '--json'], root, true))
    ])
  )
  validateCompatibility(versions, metadata)
  for (const [name, version] of Object.entries(versions))
    console.log(`${name}: ${version} (${workspace.catalog[name]})`)

  const temporary = mkdtempSync(path.join(tmpdir(), 'xpert-chatkit-update-'))
  const outputs = new Map()
  try {
    for (const [index, profile] of profiles.entries()) {
      const directory = path.join(temporary, String(index))
      profile.prepare(directory)
      console.log(`Resolving ${profile.lock}`)
      const lockFile = path.join(directory, 'pnpm-lock.yaml')
      const previous = parse(readFileSync(lockFile, 'utf8'))
      const expected = chatkitPackages.filter((name) => Object.hasOwn(previous.catalogs?.default ?? {}, name))
      assert.ok(expected.length, `Missing ChatKit catalog in ${profile.lock}`)
      // Catalogs do not update transitive-only consumers (for example Desktop's
      // web-shared dependency). Pin their resolution too, then restore source policy.
      const pinned = {
        ...workspace,
        catalog: { ...workspace.catalog, ...versions },
        overrides: { ...workspace.overrides, ...versions }
      }
      writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), stringify(pinned))
      const install = ['install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile']
      run(install, directory)
      // Restore ranges through pnpm rather than editing its lock representation.
      writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), workspaceText)
      run(install, directory)
      run(['install', '--lockfile-only', '--ignore-scripts', '--frozen-lockfile', '--offline'], directory)
      const content = readFileSync(lockFile, 'utf8')
      validateLock(content, workspace.catalog, versions, expected)
      outputs.set(profile.lock, content)
    }
    for (const [file, original] of originals) {
      // Report paths only: a changed .npmrc may contain registry credentials.
      if (readFileSync(path.join(root, file), 'utf8') !== original) {
        throw new Error(`Source changed during update: ${file}`)
      }
    }
    const written = []
    try {
      for (const [file, content] of outputs) {
        written.push(file)
        writeFileSync(path.join(root, file), content)
      }
    } catch (error) {
      for (const file of written) writeFileSync(path.join(root, file), originals.get(file))
      throw error
    }
    console.log(`Updated ${outputs.size} locks. Catalog ranges and installed node_modules are unchanged.`)
    return versions
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  updateChatkit().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
