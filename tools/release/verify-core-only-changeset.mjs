/**
 * Why this exists:
 * CI currently publishes only @metad/ocap-core.
 * Changesets can describe any workspace package, so we fail fast when a
 * release note would drift beyond the package scope supported by automation.
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const workspaceRoot = process.cwd()
const changesetDirectory = path.join(workspaceRoot, '.changeset')
const allowedPackages = new Set(['@metad/ocap-core'])

function parseFrontmatterPackages(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return []
  }

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const packageMatch = line.match(/^['"]?([^'"]+)['"]?:\s*(major|minor|patch|none)\s*$/)
      return packageMatch ? [packageMatch[1]] : []
    })
}

async function main() {
  let entries = []

  try {
    entries = await readdir(changesetDirectory, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      console.log('No .changeset directory found, skipping release scope verification.')
      return
    }

    throw error
  }

  const markdownFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')

  if (!markdownFiles.length) {
    console.log('No pending changesets found.')
    return
  }

  const invalidEntries = []

  for (const fileName of markdownFiles) {
    const absolutePath = path.join(changesetDirectory, fileName)
    const content = await readFile(absolutePath, 'utf8')
    const packageNames = parseFrontmatterPackages(content)
    const disallowedPackages = packageNames.filter((packageName) => !allowedPackages.has(packageName))

    if (disallowedPackages.length) {
      invalidEntries.push({ fileName, disallowedPackages })
    }
  }

  if (!invalidEntries.length) {
    console.log('All pending changesets match the current CI release scope.')
    return
  }

  console.error('Found changesets outside the current npm release scope:')

  for (const entry of invalidEntries) {
    console.error(`- ${entry.fileName}: ${entry.disallowedPackages.join(', ')}`)
  }

  console.error('CI currently publishes only @metad/ocap-core. Update the release scripts before expanding scope.')
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
