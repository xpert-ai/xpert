import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const packageRoot = new URL('../', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('images/catalog.json', packageRoot), 'utf8'))
const packageJson = JSON.parse(await readFile(new URL('package.json', packageRoot), 'utf8'))
const changedFrom = optionValue('--changed-from')
const selectedFamily = optionValue('--family')
const runtimeSuiteVersion = optionValue('--version') || packageJson.version

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/.test(runtimeSuiteVersion)) {
  throw new Error(`Invalid Sandbox Runtime Suite version: ${runtimeSuiteVersion}`)
}

if (selectedFamily && !catalog.images.some((entry) => entry.family === selectedFamily)) {
  throw new Error(`Unknown Sandbox Runtime image family: ${selectedFamily}`)
}

const changedFiles = changedFrom ? await listChangedFiles(changedFrom) : null
const include = []
for (const entry of catalog.images) {
  if (selectedFamily && entry.family !== selectedFamily) continue
  const image = JSON.parse(await readFile(new URL(entry.definition, packageRoot), 'utf8'))
  if (changedFiles && !familyChanged(entry.family, image, changedFiles)) continue
  include.push({
    family: image.imageFamily,
    dockerfile: `packages/sandbox-runtime/${image.dockerfile}`,
    context: '.',
    version: runtimeSuiteVersion,
    versionTag: image.playwrightVersion
      ? `${runtimeSuiteVersion}-pw${image.playwrightVersion}`
      : `${runtimeSuiteVersion}-lo${image.libreOfficeMajorVersion}`,
    profileName: image.profileName,
    repositories: image.repositories,
    smokeCommand: image.smokeCommand.join(' '),
    platforms: image.platforms.join(',')
  })
}
process.stdout.write(`${JSON.stringify({ include })}\n`)

function optionValue(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return ''
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
  return value
}

async function listChangedFiles(reference) {
  const { stdout } = await promisify(execFile)('git', [
    'diff',
    '--name-only',
    reference,
    'HEAD',
    '--',
    'packages/sandbox-runtime',
    'packages/server-ai/src/sandbox/sandbox-job/runtime-definitions'
  ])
  return stdout.split(/\r?\n/).filter(Boolean)
}

function familyChanged(family, image, files) {
  const familyPrefix = `packages/sandbox-runtime/images/${family}/`
  const runtimeDefinition = path.posix.normalize(`packages/sandbox-runtime/${image.runtimeDefinition}`)
  const sharedRunner = image.runner ? path.posix.normalize(`packages/sandbox-runtime/${image.runner}`) : undefined
  return files.some(
    (file) =>
      file.startsWith(familyPrefix) ||
      file === sharedRunner ||
      file === runtimeDefinition ||
      file.startsWith('packages/sandbox-runtime/scripts/') ||
      [
        'packages/sandbox-runtime/package.json',
        'packages/sandbox-runtime/project.json',
        'packages/sandbox-runtime/images/catalog.json'
      ].includes(file)
  )
}
