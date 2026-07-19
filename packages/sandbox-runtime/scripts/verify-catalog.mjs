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
  const runnerPath = image.runner ?? path.join('images', entry.family, 'runtime', 'runner-host.mjs')
  const runner = await readFile(path.join(packageRoot, runnerPath))
  const runnerSha256 = createHash('sha256').update(runner).digest('hex')
  const manifest = await readJson(image.manifest)
  const runtimeDefinition = await readJson(image.runtimeDefinition)
  let modelCatalogSha256
  if (image.resourceCatalog) {
    const resourceCatalogBytes = await readFile(path.join(packageRoot, image.resourceCatalog))
    const resourceCatalog = JSON.parse(resourceCatalogBytes.toString('utf8'))
    verifyResourceCatalog(resourceCatalog, packageJson.version, entry.family)
    modelCatalogSha256 = createHash('sha256').update(resourceCatalogBytes).digest('hex')
  }
  if (manifest.sandboxRuntimeVersion !== packageJson.version)
    fail(`${entry.family} runtime version differs from package version.`)
  if (manifest.runnerHostSha256 !== runnerSha256)
    fail(`${entry.family} Runner Host SHA-256 is stale. Run "pnpm --filter @xpert-ai/sandbox-runtime sync:metadata".`)
  if (manifest.profileName !== image.profileName || manifest.contractVersion !== image.runtimeContractVersion)
    fail(`${entry.family} runtime contract is inconsistent.`)
  if (modelCatalogSha256 && manifest.modelCatalogSha256 !== modelCatalogSha256)
    fail(`${entry.family} model catalog SHA-256 is stale. Run "pnpm --filter @xpert-ai/sandbox-runtime sync:metadata".`)
  if (runtimeDefinition.name !== image.profileName) fail(`${entry.family} Runtime Definition profile is inconsistent.`)
  if (runtimeDefinition.contractVersion !== image.runtimeContractVersion)
    fail(`${entry.family} Runtime Definition contract is inconsistent.`)
  if (runtimeDefinition.sandboxRuntimeVersion !== packageJson.version)
    fail(`${entry.family} Runtime Definition version differs from Runtime Suite.`)
  if (runtimeDefinition.expectedManifest?.runnerHostSha256 !== runnerSha256)
    fail(
      `${entry.family} Runtime Definition Runner Host SHA-256 is stale. Run "pnpm --filter @xpert-ai/sandbox-runtime sync:metadata".`
    )
  if (modelCatalogSha256 && runtimeDefinition.expectedManifest?.modelCatalogSha256 !== modelCatalogSha256)
    fail(`${entry.family} Runtime Definition model catalog SHA-256 is stale.`)
  if (modelCatalogSha256) {
    const dockerfile = await readFile(path.join(packageRoot, image.dockerfile), 'utf8')
    if (!dockerfile.includes(`org.xpert.sandbox.runtime-profile="${image.profileName}"`)) {
      fail(`${entry.family} Dockerfile Runtime profile label is stale.`)
    }
    if (!dockerfile.includes(`org.xpert.sandbox.runtime-suite-version="${packageJson.version}"`)) {
      fail(`${entry.family} Dockerfile Runtime Suite version label is stale.`)
    }
    if (!dockerfile.includes(`org.xpert.sandbox.model-catalog-sha256="${modelCatalogSha256}"`)) {
      fail(`${entry.family} Dockerfile model catalog SHA-256 label is stale.`)
    }
  }
  if ('provider' in runtimeDefinition || 'image' in runtimeDefinition)
    fail(`${entry.family} Runtime Definition must be provider-neutral.`)
  if (/presentation|motion|hyperframes/i.test(JSON.stringify({ image, manifest, runtimeDefinition })))
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

function verifyResourceCatalog(value, runtimeSuiteVersion, family) {
  if (
    !value ||
    value.version !== 1 ||
    value.runtimeSuiteVersion !== runtimeSuiteVersion ||
    !Array.isArray(value.resources)
  ) {
    fail(`${family} resource catalog is invalid or has a stale Runtime Suite version.`)
  }
  const keys = new Set()
  let modelCount = 0
  let onnxRuntimeCount = 0
  for (const resource of value.resources) {
    if (
      !resource ||
      typeof resource.key !== 'string' ||
      !resource.key ||
      keys.has(resource.key) ||
      (resource.type !== 'model' && resource.type !== 'onnxruntime') ||
      !safeRelativePath(resource.path) ||
      !Array.isArray(resource.files) ||
      !resource.files.length ||
      !/^[a-f0-9]{64}$/i.test(resource.treeSha256 ?? '')
    )
      fail(`${family} resource catalog contains an invalid resource.`)
    keys.add(resource.key)
    if (resource.type === 'model') {
      modelCount += 1
      if (
        typeof resource.modelId !== 'string' ||
        typeof resource.revision !== 'string' ||
        !/^[a-f0-9]{40}$/i.test(resource.revision) ||
        typeof resource.dtype !== 'string'
      )
        fail(`${family} model resource ${resource.key} is incomplete.`)
    } else {
      onnxRuntimeCount += 1
      if (typeof resource.version !== 'string' || !resource.version) {
        fail(`${family} ONNX Runtime resource ${resource.key} is incomplete.`)
      }
    }
    const filePaths = new Set()
    for (const file of resource.files) {
      if (
        !file ||
        !safeRelativePath(file.path) ||
        filePaths.has(file.path) ||
        typeof file.url !== 'string' ||
        !file.url.startsWith('https://') ||
        !Number.isSafeInteger(file.size) ||
        file.size <= 0 ||
        !/^[a-f0-9]{64}$/i.test(file.sha256 ?? '')
      )
        fail(`${family} resource ${resource.key} contains an invalid file.`)
      filePaths.add(file.path)
    }
    const treeHash = createHash('sha256')
    for (const file of [...resource.files].sort((left, right) => left.path.localeCompare(right.path))) {
      treeHash.update(`${file.path}\0${file.size}\0${file.sha256.toLowerCase()}\n`)
    }
    if (treeHash.digest('hex') !== resource.treeSha256.toLowerCase()) {
      fail(`${family} resource ${resource.key} tree SHA-256 is stale.`)
    }
  }
  if (family === 'browser-ai' && (modelCount < 1 || onnxRuntimeCount !== 1)) {
    fail('browser-ai must contain at least one model and exactly one ONNX Runtime resource.')
  }
}

function safeRelativePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes('\0') &&
    value.split(/[\\/]/).every((part) => part && part !== '.' && part !== '..')
  )
}
