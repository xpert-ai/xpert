import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const packageRoot = new URL('../', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('images/catalog.json', packageRoot), 'utf8'))
const packageJson = JSON.parse(await readFile(new URL('package.json', packageRoot), 'utf8'))
const changedFromIndex = process.argv.indexOf('--changed-from')
const changedFrom = changedFromIndex >= 0 ? process.argv[changedFromIndex + 1] : ''
const changedFiles = changedFrom ? await listChangedFiles(changedFrom) : null
const include = []
for (const entry of catalog.images) {
  const image = JSON.parse(await readFile(new URL(entry.definition, packageRoot), 'utf8'))
  if (changedFiles && !familyChanged(entry.family, changedFiles)) continue
  include.push({
    family: image.imageFamily,
    dockerfile: `packages/sandbox-runtime/${image.dockerfile}`,
    context: '.',
    version: packageJson.version,
    versionTag: `${packageJson.version}-pw${image.playwrightVersion}`,
    profileName: image.profileName,
    repositories: image.repositories,
    smokeCommand: image.smokeCommand.join(' '),
    platforms: image.platforms.join(',')
  })
}
process.stdout.write(`${JSON.stringify({ include })}\n`)

async function listChangedFiles(reference) {
  const { stdout } = await promisify(execFile)('git', [
    'diff',
    '--name-only',
    reference,
    'HEAD',
    '--',
    'packages/sandbox-runtime'
  ])
  return stdout.split(/\r?\n/).filter(Boolean)
}

function familyChanged(family, files) {
  const familyPrefix = `packages/sandbox-runtime/images/${family}/`
  return files.some(
    (file) =>
      file.startsWith(familyPrefix) ||
      file.startsWith('packages/sandbox-runtime/scripts/') ||
      [
        'packages/sandbox-runtime/package.json',
        'packages/sandbox-runtime/project.json',
        'packages/sandbox-runtime/images/catalog.json'
      ].includes(file)
  )
}
