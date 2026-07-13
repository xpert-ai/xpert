import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = await readJson('package.json')
const catalog = await readJson('images/catalog.json')
if (catalog.catalogVersion !== 1 || !Array.isArray(catalog.images) || !catalog.images.length)
  fail('Catalog must contain image families.')
const families = new Set()
const matrix = []
const runtimeDefinitions = []
for (const entry of catalog.images) {
  if (!entry || typeof entry.family !== 'string' || typeof entry.definition !== 'string')
    fail('Catalog image entry is invalid.')
  if (families.has(entry.family)) fail(`Duplicate image family: ${entry.family}`)
  families.add(entry.family)
  const image = await readJson(entry.definition)
  if (image.imageFamily !== entry.family) fail(`Image family mismatch for ${entry.definition}.`)
  const imagePackage = await readJson(path.join('images', entry.family, 'package.json'))
  if (imagePackage.version !== packageJson.version)
    fail(`${entry.family} image package version differs from Runtime Suite.`)
  for (const field of ['dockerfile', 'manifest', 'runtimeDefinition', 'artifactCatalogTemplate']) {
    await readFile(path.join(packageRoot, image[field]))
  }
  for (const reference of Object.values(image.baseImages ?? {})) {
    if (typeof reference !== 'string' || !/@sha256:[a-f0-9]{64}$/i.test(reference))
      fail(`${entry.family} base images must be digest pinned.`)
  }
  const runner = await readFile(path.join(packageRoot, 'images', entry.family, 'runtime', 'runner-host.mjs'))
  const runnerSha256 = createHash('sha256').update(runner).digest('hex')
  const manifest = await readJson(image.manifest)
  const runtimeDefinition = await readJson(image.runtimeDefinition)
  if (manifest.sandboxRuntimeVersion !== packageJson.version)
    fail(`${entry.family} runtime version differs from package version.`)
  if (manifest.runnerHostSha256 !== runnerSha256) fail(`${entry.family} Runner Host SHA-256 is stale.`)
  if (manifest.profileName !== image.profileName || manifest.contractVersion !== image.runtimeContractVersion)
    fail(`${entry.family} runtime contract is inconsistent.`)
  if (runtimeDefinition.name !== image.profileName) fail(`${entry.family} Runtime Definition profile is inconsistent.`)
  if (runtimeDefinition.contractVersion !== image.runtimeContractVersion)
    fail(`${entry.family} Runtime Definition contract is inconsistent.`)
  if (runtimeDefinition.sandboxRuntimeVersion !== packageJson.version)
    fail(`${entry.family} Runtime Definition version differs from Runtime Suite.`)
  if (runtimeDefinition.expectedManifest?.runnerHostSha256 !== runnerSha256)
    fail(`${entry.family} Runtime Definition Runner Host SHA-256 is stale.`)
  if ('provider' in runtimeDefinition || 'image' in runtimeDefinition)
    fail(`${entry.family} Runtime Definition must be provider-neutral.`)
  if (JSON.stringify({ image, manifest, runtimeDefinition }).toLowerCase().includes('presentation'))
    fail(`${entry.family} runtime contains plugin-specific identifiers.`)
  runtimeDefinitions.push(runtimeDefinition)
  matrix.push({ family: entry.family, definition: entry.definition, version: packageJson.version })
}
const definitionsOutputIndex = process.argv.indexOf('--definitions-output')
if (definitionsOutputIndex >= 0) {
  const output = path.resolve(process.argv[definitionsOutputIndex + 1])
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(
    output,
    `${JSON.stringify(
      {
        version: 1,
        runtimeSuiteVersion: packageJson.version,
        definitions: runtimeDefinitions
      },
      null,
      2
    )}\n`
  )
}
const outputIndex = process.argv.indexOf('--output')
if (outputIndex >= 0) {
  const output = path.resolve(process.argv[outputIndex + 1])
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify({ include: matrix }, null, 2)}\n`)
}
process.stdout.write(`verified ${matrix.length} Sandbox Runtime image family\n`)

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), 'utf8'))
}
function fail(message) {
  throw new Error(message)
}
