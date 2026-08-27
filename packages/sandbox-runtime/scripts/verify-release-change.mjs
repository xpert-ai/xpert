import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const packageName = '@xpert-ai/sandbox-runtime'
const packageJsonPath = 'packages/sandbox-runtime/package.json'
const packageRoot = 'packages/sandbox-runtime/'
const runtimeDefinitionRoot = 'packages/server-ai/src/sandbox/sandbox-job/runtime-definitions/'

export function validateRuntimeReleaseChange({ changedFiles, baseVersion, currentVersion, changesetContents }) {
  const releaseInputs = changedFiles.filter(isRuntimeReleaseInput)
  if (releaseInputs.length === 0 || baseVersion !== currentVersion) return
  if (changesetContents.some((content) => changesetReleasesPackage(content))) return

  throw new Error(
    `Sandbox Runtime release inputs (${releaseInputs.join(', ')}) must include a Changeset for ${packageName}. ` +
      'Run "corepack pnpm changeset" and select a patch, minor, or major release.'
  )
}

async function verifyReleaseChange(changedFrom) {
  const [{ stdout: changedFilesOutput }, { stdout: basePackageOutput }, { stdout: changesetFilesOutput }] =
    await Promise.all([
      execFileAsync('git', ['diff', '--name-only', changedFrom, 'HEAD', '--', packageRoot, runtimeDefinitionRoot]),
      execFileAsync('git', ['show', `${changedFrom}:${packageJsonPath}`]),
      execFileAsync('git', ['diff', '--name-only', '--diff-filter=AM', changedFrom, 'HEAD', '--', '.changeset'])
    ])

  const basePackage = JSON.parse(basePackageOutput)
  const currentPackage = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const changedFiles = changedFilesOutput.split(/\r?\n/).filter(Boolean)
  const changesetFiles = changesetFilesOutput
    .split(/\r?\n/)
    .filter((file) => file.endsWith('.md') && path.basename(file) !== 'README.md')
  const changesetContents = await Promise.all(changesetFiles.map((file) => readFile(file, 'utf8')))

  validateRuntimeReleaseChange({
    changedFiles,
    baseVersion: basePackage.version,
    currentVersion: currentPackage.version,
    changesetContents
  })
}

function isRuntimeReleaseInput(file) {
  if (file === packageJsonPath || file.startsWith(runtimeDefinitionRoot)) return true
  if (file.startsWith(`${packageRoot}scripts/`)) return !file.endsWith('.test.mjs')
  if (!file.startsWith(`${packageRoot}images/`)) return false
  return !file.includes('/tests/')
}

function changesetReleasesPackage(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) return false
  return new RegExp(`^\\s*["']?${escapeRegExp(packageName)}["']?\\s*:\\s*["']?(patch|minor|major)["']?\\s*$`, 'm').test(
    frontmatter[1]
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function optionValue(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return ''
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
  return value
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) {
  const changedFrom = optionValue('--changed-from')
  if (!changedFrom) throw new Error('Usage: verify-release-change.mjs --changed-from <git-reference>')
  await verifyReleaseChange(changedFrom)
}
