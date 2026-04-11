#!/usr/bin/env node

/**
 * Why this exists:
 * Changesets versions source manifests, but npm publishing in this workspace
 * must happen from build outputs. This script mirrors the Changesets publish
 * phase by scanning publishable workspace packages and publishing only the
 * versions that are not already on npm.
 */

import { spawnSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { getPackages } from '@manypkg/get-packages'

const workspaceRoot = process.cwd()
const dependencySections = ['dependencies', 'peerDependencies', 'optionalDependencies']
const args = parseArgs(process.argv.slice(2))

async function main() {
  const [changesetsConfig, preState, workspacePackages] = await Promise.all([
    readJsonIfExists(path.join(workspaceRoot, '.changeset', 'config.json')),
    readJsonIfExists(path.join(workspaceRoot, '.changeset', 'pre.json')),
    getWorkspacePackages(),
  ])

  const publishablePackages = workspacePackages
    .filter(isPublishablePackage)
    .filter((pkg) => matchesFilter(pkg, args.filters))

  if (publishablePackages.length === 0) {
    console.log('No publishable workspace packages matched the current selection.')
    return
  }

  console.log(`Found ${publishablePackages.length} publishable workspace packages to evaluate.`)

  const orderedPackages = topologicallySortPackages(publishablePackages)
  const publishedPackages = []

  for (const pkg of orderedPackages) {
    const spec = `${pkg.name}@${pkg.version}`

    if (await isVersionPublished(pkg.name, pkg.version)) {
      console.log(`Skipping ${spec}; this version is already available on npm.`)
      continue
    }

    await buildPackageIfNeeded(pkg)

    const publishRoot = await resolvePublishRoot(pkg)
    const publishManifest = await readPublishManifest(pkg, publishRoot)
    const distTag = resolveDistTag(publishManifest.version, preState)
    const accessLevel = resolveAccessLevel(pkg, publishManifest, changesetsConfig)

    console.log(
      `${args.dryRun ? 'Dry-running publish for' : 'Publishing'} ${spec} from ${relativeToWorkspace(
        publishRoot
      )} with tag "${distTag}".`
    )

    const publishArgs = ['publish', '--tag', distTag]
    if (shouldPassAccessFlag(publishManifest.name, accessLevel)) {
      publishArgs.push('--access', accessLevel)
    }
    if (args.dryRun) {
      publishArgs.push('--dry-run')
    }

    run('npm', publishArgs, { cwd: publishRoot })
    publishedPackages.push(`${spec} (${distTag})`)
  }

  if (publishedPackages.length === 0) {
    console.log('No npm packages were published in this run.')
    console.log('All publishable workspace package versions are already available on npm.')
    return
  }

  console.log(`${args.dryRun ? 'Dry-ran' : 'Published'} ${publishedPackages.length} package(s):`)
  for (const spec of publishedPackages) {
    console.log(`- ${spec}`)
  }
}

function parseArgs(argv) {
  const filters = []
  let dryRun = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--dry-run') {
      dryRun = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--filter') {
      const filter = argv[index + 1]
      if (!filter) {
        throw new Error('Expected a package name, project name, or workspace path after --filter.')
      }
      filters.push(filter)
      index += 1
      continue
    }

    if (arg.startsWith('--filter=')) {
      filters.push(arg.slice('--filter='.length))
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { dryRun, filters }
}

function printUsage() {
  console.log('Usage: node tools/release/publish-npm-packages.mjs [--dry-run] [--filter <value>]')
}

async function getWorkspacePackages() {
  const result = await getPackages(workspaceRoot)

  return Promise.all(
    result.packages.map(async (workspacePackage) => {
      const packageDir = workspacePackage.dir
      const relativeDir = path.relative(workspaceRoot, packageDir) || '.'
      const project = await readJsonIfExists(path.join(packageDir, 'project.json'))

      return {
        dir: packageDir,
        name: workspacePackage.packageJson.name,
        packageJson: workspacePackage.packageJson,
        project,
        projectName: project?.name ?? null,
        relativeDir,
        version: workspacePackage.packageJson.version,
      }
    })
  )
}

function isPublishablePackage(pkg) {
  if (!pkg.name || !pkg.version) {
    return false
  }

  if (pkg.packageJson.private) {
    return false
  }

  if (pkg.relativeDir === '.') {
    return false
  }

  if (pkg.project?.projectType && pkg.project.projectType !== 'library') {
    return false
  }

  const [topLevelDir] = pkg.relativeDir.split(path.sep)
  if (topLevelDir === 'apps' && pkg.project?.projectType !== 'library') {
    return false
  }

  return true
}

function matchesFilter(pkg, filters) {
  if (filters.length === 0) {
    return true
  }

  return filters.some(
    (filter) => filter === pkg.name || filter === pkg.projectName || filter === pkg.relativeDir
  )
}

function topologicallySortPackages(packages) {
  const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const incomingCounts = new Map(packages.map((pkg) => [pkg.name, 0]))
  const outgoingEdges = new Map(packages.map((pkg) => [pkg.name, new Set()]))

  for (const pkg of packages) {
    const internalDependencies = getInternalDependencies(pkg, packagesByName)
    for (const dependencyName of internalDependencies) {
      outgoingEdges.get(dependencyName).add(pkg.name)
      incomingCounts.set(pkg.name, incomingCounts.get(pkg.name) + 1)
    }
  }

  const ready = packages
    .filter((pkg) => incomingCounts.get(pkg.name) === 0)
    .map((pkg) => pkg.name)
    .sort()

  const orderedNames = []
  while (ready.length > 0) {
    const name = ready.shift()
    orderedNames.push(name)

    for (const dependentName of outgoingEdges.get(name)) {
      const nextCount = incomingCounts.get(dependentName) - 1
      incomingCounts.set(dependentName, nextCount)
      if (nextCount === 0) {
        ready.push(dependentName)
        ready.sort()
      }
    }
  }

  if (orderedNames.length !== packages.length) {
    const remainingNames = packages
      .map((pkg) => pkg.name)
      .filter((name) => !orderedNames.includes(name))
      .sort()

    console.warn(
      `Encountered a publish ordering cycle across: ${remainingNames.join(
        ', '
      )}. Falling back to alphabetical order for the remaining packages.`
    )

    orderedNames.push(...remainingNames)
  }

  return orderedNames.map((name) => packagesByName.get(name))
}

function getInternalDependencies(pkg, packagesByName) {
  const dependencyNames = new Set()

  for (const section of dependencySections) {
    for (const name of Object.keys(pkg.packageJson[section] ?? {})) {
      if (name !== pkg.name && packagesByName.has(name)) {
        dependencyNames.add(name)
      }
    }
  }

  return dependencyNames
}

async function buildPackageIfNeeded(pkg) {
  if (!pkg.project?.targets?.build) {
    return
  }

  if (!pkg.projectName) {
    throw new Error(
      `Cannot build ${pkg.name} because ${path.join(
        pkg.relativeDir,
        'project.json'
      )} does not declare a project name.`
    )
  }

  console.log(`Building ${pkg.name} via nx project "${pkg.projectName}".`)
  run('pnpm', ['nx', 'run', `${pkg.projectName}:build`])
}

async function resolvePublishRoot(pkg) {
  const publishDirectory = pkg.packageJson.publishConfig?.directory
  if (typeof publishDirectory === 'string' && publishDirectory.trim() !== '') {
    return path.resolve(pkg.dir, publishDirectory)
  }

  const releasePackageRoot = pkg.project?.targets?.['nx-release-publish']?.options?.packageRoot
  if (typeof releasePackageRoot === 'string' && releasePackageRoot.trim() !== '') {
    return resolveFromWorkspaceTemplate(releasePackageRoot, pkg)
  }

  const buildOptions = pkg.project?.targets?.build?.options ?? {}
  const ngPackageRoot = await resolveNgPackagrDest(buildOptions.project)
  if (ngPackageRoot) {
    return ngPackageRoot
  }

  const outputPath = buildOptions.outputPath
  if (typeof outputPath === 'string' && outputPath.trim() !== '') {
    return resolveFromWorkspaceTemplate(outputPath, pkg)
  }

  return pkg.dir
}

async function resolveNgPackagrDest(projectOption) {
  if (typeof projectOption !== 'string' || !projectOption.endsWith('ng-package.json')) {
    return null
  }

  const ngPackagePath = path.resolve(workspaceRoot, projectOption)
  const ngPackageConfig = await readJsonIfExists(ngPackagePath)
  if (!ngPackageConfig?.dest) {
    return null
  }

  return path.resolve(path.dirname(ngPackagePath), ngPackageConfig.dest)
}

function resolveFromWorkspaceTemplate(template, pkg) {
  const rendered = template
    .replaceAll('{projectName}', pkg.projectName ?? path.basename(pkg.dir))
    .replaceAll('{projectRoot}', pkg.relativeDir)
    .replaceAll('{workspaceRoot}', workspaceRoot)

  return path.isAbsolute(rendered) ? path.normalize(rendered) : path.resolve(workspaceRoot, rendered)
}

async function readPublishManifest(pkg, publishRoot) {
  const manifestPath = path.join(publishRoot, 'package.json')
  const publishManifest = await readJsonIfExists(manifestPath)

  if (!publishManifest) {
    throw new Error(
      `Expected ${pkg.name} to publish from ${relativeToWorkspace(
        publishRoot
      )}, but ${relativeToWorkspace(manifestPath)} does not exist.`
    )
  }

  if (publishManifest.name !== pkg.name) {
    throw new Error(
      `Publish manifest mismatch for ${pkg.name}: expected name "${pkg.name}", found "${publishManifest.name}".`
    )
  }

  if (publishManifest.version !== pkg.version) {
    throw new Error(
      `Publish manifest version mismatch for ${pkg.name}: expected "${pkg.version}", found "${publishManifest.version}". Rebuild the package or fix its publish directory configuration.`
    )
  }

  return publishManifest
}

function resolveDistTag(version, preState) {
  const tagFromEnv = process.env.NPM_DIST_TAG ?? process.env.npm_config_tag
  if (tagFromEnv?.trim()) {
    return tagFromEnv.trim()
  }

  if (preState?.mode === 'pre' && typeof preState.tag === 'string' && preState.tag.trim()) {
    return preState.tag.trim()
  }

  const prereleaseMatch = version.match(/^\d+\.\d+\.\d+-([0-9A-Za-z-]+)/)
  if (prereleaseMatch) {
    return prereleaseMatch[1]
  }

  return 'latest'
}

function resolveAccessLevel(pkg, publishManifest, changesetsConfig) {
  return (
    publishManifest.publishConfig?.access ??
    pkg.packageJson.publishConfig?.access ??
    pkg.project?.targets?.['nx-release-publish']?.options?.access ??
    changesetsConfig?.access ??
    null
  )
}

function shouldPassAccessFlag(packageName, accessLevel) {
  if (!accessLevel) {
    return false
  }

  if (packageName.startsWith('@')) {
    return true
  }

  return accessLevel !== 'public'
}

async function isVersionPublished(packageName, version) {
  const spec = `${packageName}@${version}`
  const registryUrl = new URL(
    `${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
    ensureTrailingSlash(process.env.npm_config_registry ?? 'https://registry.npmjs.org')
  )

  const response = await fetch(registryUrl, {
    headers: {
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (response.status === 200) {
    return true
  }

  if (response.status === 404) {
    return false
  }

  const responseBody = await response.text()
  throw new Error(
    `Failed to query npm for ${spec}: ${response.status} ${response.statusText}\n${responseBody.trim()}`
  )
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? workspaceRoot,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const renderedCommand = [command, ...commandArgs].join(' ')
    throw new Error(`Command failed with exit code ${result.status}: ${renderedCommand}`)
  }
}

async function readJsonIfExists(filePath) {
  try {
    await access(filePath)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }

  return JSON.parse(await readFile(filePath, 'utf8'))
}

function relativeToWorkspace(targetPath) {
  return path.relative(workspaceRoot, targetPath) || '.'
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
