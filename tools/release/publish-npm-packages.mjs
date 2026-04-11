/**
 * Why this exists:
 * Changesets versions source manifests, but npm publishing must happen from
 * built dist outputs. The release workflow also runs on every push to main, so
 * publishing must be safe to skip unless the current commit versions a
 * publishable workspace library.
 */

import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const workspaceRoot = process.cwd()

function formatCommand(command, args) {
  return [command, ...args].join(' ')
}

function run(command, args, options = {}) {
  const {
    allowFailure = false,
    capture = false,
    cwd = workspaceRoot,
    env = {}
  } = options

  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env
    },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  })

  if (allowFailure || result.status === 0) {
    return result
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  throw new Error(`Command failed (${formatCommand(command, args)}):\n${output}`)
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(workspaceRoot, relativePath), 'utf8'))
}

function normalizeRelativePath(filePath) {
  return filePath.replaceAll('\\', '/')
}

function getHeadChangedFiles() {
  const result = run('git', ['show', '--name-only', '--pretty=format:', 'HEAD'], { capture: true })

  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  )
}

function getChangedManifestPaths(headChangedFiles) {
  return [...headChangedFiles]
    .filter((filePath) => filePath.endsWith('/package.json'))
    .filter((filePath) => filePath !== 'package.json')
    .sort((left, right) => left.localeCompare(right))
}

function resolvePackageRoot(projectRoot, projectConfig, sourceManifest) {
  const buildTarget = projectConfig.targets?.build
  const buildOutputPath = buildTarget?.options?.outputPath
  const pathTemplates = [
    sourceManifest.publishConfig?.directory,
    projectConfig.targets?.['nx-release-publish']?.options?.packageRoot,
    buildOutputPath,
    ...(buildTarget?.outputs ?? [])
  ]

  for (const template of pathTemplates) {
    if (typeof template !== 'string' || !template.trim()) {
      continue
    }

    const resolvedPath = template
      .replaceAll('{workspaceRoot}/', '')
      .replaceAll('{workspaceRoot}', '')
      .replaceAll('{projectRoot}', projectRoot)
      .replaceAll('{options.outputPath}', buildOutputPath ?? '')

    if (!resolvedPath || resolvedPath.includes('{')) {
      continue
    }

    return normalizeRelativePath(resolvedPath)
  }

  return null
}

function getInternalDependencyProjectNames(packageManifest, packageNameToProject) {
  const candidates = new Map()

  for (const dependencyType of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const dependencies = packageManifest[dependencyType] ?? {}

    for (const dependencyName of Object.keys(dependencies)) {
      const dependencyProjectName = packageNameToProject.get(dependencyName)
      if (dependencyProjectName) {
        candidates.set(dependencyProjectName, true)
      }
    }
  }

  return [...candidates.keys()].sort((left, right) => left.localeCompare(right))
}

async function getReleasePackages(headChangedFiles) {
  const changedManifestPaths = getChangedManifestPaths(headChangedFiles)
  const candidates = new Map()

  for (const sourcePackageJson of changedManifestPaths) {
    const projectRoot = normalizeRelativePath(path.posix.dirname(sourcePackageJson))
    let sourceManifest
    let projectConfig

    try {
      sourceManifest = await readJson(sourcePackageJson)
      projectConfig = await readJson(path.posix.join(projectRoot, 'project.json'))
    } catch {
      continue
    }

    if (
      !projectConfig.name ||
      projectConfig.projectType !== 'library' ||
      !sourceManifest.name ||
      !sourceManifest.version ||
      sourceManifest.private
    ) {
      continue
    }

    const packageRoot = resolvePackageRoot(projectRoot, projectConfig, sourceManifest)
    if (!packageRoot) {
      continue
    }

    candidates.set(projectConfig.name, {
      projectName: projectConfig.name,
      packageName: sourceManifest.name,
      sourcePackageJson,
      packageRoot,
      access: sourceManifest.publishConfig?.access ?? 'public',
      sourceManifest
    })
  }

  const orderedPackages = []
  const visiting = new Set()
  const visited = new Set()
  const projectNames = [...candidates.keys()].sort((left, right) => left.localeCompare(right))
  const packageNameToProject = new Map(
    [...candidates.values()].map((pkg) => [pkg.packageName, pkg.projectName])
  )

  function visit(projectName) {
    const pkg = candidates.get(projectName)

    if (visited.has(projectName) || visiting.has(projectName) || !pkg) {
      return
    }

    visiting.add(projectName)

    for (const dependencyProjectName of getInternalDependencyProjectNames(pkg.sourceManifest, packageNameToProject)) {
      visit(dependencyProjectName)
    }

    visiting.delete(projectName)
    visited.add(projectName)
    orderedPackages.push(pkg)
  }

  for (const projectName of projectNames) {
    visit(projectName)
  }

  return orderedPackages
}

function resolveDistTag(version) {
  const explicitTag = process.env.NPM_DIST_TAG?.trim()
  if (explicitTag) {
    return explicitTag
  }

  const [, prerelease = ''] = version.split('-', 2)
  if (!prerelease) {
    return 'latest'
  }

  const [tag] = prerelease.split('.', 1)
  return tag || 'next'
}

function isVersionPublished(packageName, version) {
  const result = run('npm', ['view', `${packageName}@${version}`, 'version', '--json'], {
    allowFailure: true,
    capture: true
  })

  if (result.status === 0) {
    const output = result.stdout.trim()

    if (!output) {
      return false
    }

    try {
      return JSON.parse(output) === version
    } catch {
      return output.replaceAll('"', '') === version
    }
  }

  const errorOutput = [result.stdout, result.stderr].filter(Boolean).join('\n')
  if (/E404|404 Not Found|No match found/i.test(errorOutput)) {
    return false
  }

  throw new Error(`Unable to query npm for ${packageName}@${version}:\n${errorOutput}`)
}

function tagExists(tagName) {
  const result = run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`], {
    allowFailure: true,
    capture: true
  })

  return result.status === 0
}

function createTag(tagName) {
  run('git', ['tag', tagName])
}

function pushTag(tagName) {
  run('git', ['push', 'origin', `refs/tags/${tagName}`])
}

async function buildAndValidate(pkg, version) {
  run('pnpm', ['nx', 'build', pkg.projectName])

  const distManifestPath = path.join(pkg.packageRoot, 'package.json')
  const distManifest = await readJson(distManifestPath)

  if (distManifest.version !== version) {
    throw new Error(
      `Built manifest ${distManifestPath} has version ${distManifest.version}, expected ${version}.`
    )
  }
}

async function publishPackage(pkg, version) {
  const distTag = resolveDistTag(version)
  const packageRoot = path.join(workspaceRoot, pkg.packageRoot)

  console.log(`Publishing ${pkg.packageName}@${version} with dist-tag "${distTag}" from ${pkg.packageRoot}`)

  run('npm', ['publish', '--access', pkg.access, '--tag', distTag], {
    cwd: packageRoot
  })
}

async function main() {
  const headChangedFiles = getHeadChangedFiles()
  const releasePackages = await getReleasePackages(headChangedFiles)
  const createdTags = []
  const publishedPackages = []
  const skippedPackages = []

  for (const pkg of releasePackages) {
    const sourceManifest = await readJson(pkg.sourcePackageJson)
    const version = sourceManifest.version
    const releaseTag = `${pkg.packageName}@${version}`
    const headLooksLikeReleaseCommit = headChangedFiles.has(pkg.sourcePackageJson)
    const alreadyPublished = isVersionPublished(pkg.packageName, version)

    if (!alreadyPublished) {
      if (!headLooksLikeReleaseCommit) {
        skippedPackages.push(
          `${pkg.packageName}@${version} is not on npm, but HEAD does not modify ${pkg.sourcePackageJson}; skipping to avoid publishing unrelated code under an old version.`
        )
        continue
      }

      await buildAndValidate(pkg, version)
      await publishPackage(pkg, version)
      publishedPackages.push(`${pkg.packageName}@${version}`)
    } else {
      console.log(`${pkg.packageName}@${version} is already published on npm.`)
    }

    if (headLooksLikeReleaseCommit && !tagExists(releaseTag)) {
      createTag(releaseTag)
      createdTags.push(releaseTag)
    }
  }

  for (const tagName of createdTags) {
    pushTag(tagName)
  }

  if (publishedPackages.length) {
    console.log(`Published packages: ${publishedPackages.join(', ')}`)
  } else {
    console.log('No npm packages were published in this run.')
  }

  if (createdTags.length) {
    console.log(`Pushed release tags: ${createdTags.join(', ')}`)
  }

  if (skippedPackages.length) {
    for (const message of skippedPackages) {
      console.warn(message)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
