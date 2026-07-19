import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const suite = await readJson('package.json')
const catalog = await readJson('images/catalog.json')
for (const entry of catalog.images) {
  const image = await readJson(entry.definition)
  const imagePackagePath = path.join('images', entry.family, 'package.json')
  const imagePackage = await readJson(imagePackagePath)
  imagePackage.version = suite.version
  await writeJson(imagePackagePath, imagePackage)
  const imageLockPath = path.join('images', entry.family, 'package-lock.json')
  const imageLock = await readJson(imageLockPath)
  imageLock.version = suite.version
  if (imageLock.packages?.['']) imageLock.packages[''].version = suite.version
  await writeJson(imageLockPath, imageLock)
  const runnerPath = image.runner ?? path.join('images', entry.family, 'runtime', 'runner-host.mjs')
  const runner = await readFile(path.join(packageRoot, runnerPath))
  const runnerHostSha256 = createHash('sha256').update(runner).digest('hex')
  let modelCatalogSha256
  if (image.resourceCatalog) {
    const resourceCatalog = await readJson(image.resourceCatalog)
    resourceCatalog.runtimeSuiteVersion = suite.version
    await writeJson(image.resourceCatalog, resourceCatalog)
    const resourceCatalogBytes = await readFile(path.join(packageRoot, image.resourceCatalog))
    modelCatalogSha256 = createHash('sha256').update(resourceCatalogBytes).digest('hex')
    const dockerfilePath = path.join(packageRoot, image.dockerfile)
    const dockerfile = await readFile(dockerfilePath, 'utf8')
    if (
      !/org\.xpert\.sandbox\.runtime-suite-version="[^"]+"/.test(dockerfile) ||
      !/org\.xpert\.sandbox\.model-catalog-sha256="[a-f0-9]{64}"/i.test(dockerfile)
    )
      throw new Error(`${entry.family} Dockerfile Runtime metadata labels are missing.`)
    const synchronizedDockerfile = dockerfile
      .replace(
        /org\.xpert\.sandbox\.runtime-suite-version="[^"]+"/,
        `org.xpert.sandbox.runtime-suite-version="${suite.version}"`
      )
      .replace(
        /org\.xpert\.sandbox\.model-catalog-sha256="[a-f0-9]{64}"/i,
        `org.xpert.sandbox.model-catalog-sha256="${modelCatalogSha256}"`
      )
    await writeFile(dockerfilePath, synchronizedDockerfile)
  }
  const manifest = await readJson(image.manifest)
  manifest.sandboxRuntimeVersion = suite.version
  manifest.runnerHostSha256 = runnerHostSha256
  if (modelCatalogSha256) manifest.modelCatalogSha256 = modelCatalogSha256
  await writeJson(image.manifest, manifest)
  const runtimeDefinition = await readJson(image.runtimeDefinition)
  runtimeDefinition.sandboxRuntimeVersion = suite.version
  if (runtimeDefinition.expectedManifest) {
    runtimeDefinition.expectedManifest.sandboxRuntimeVersion = suite.version
    runtimeDefinition.expectedManifest.runnerHostSha256 = runnerHostSha256
    if (modelCatalogSha256) runtimeDefinition.expectedManifest.modelCatalogSha256 = modelCatalogSha256
  }
  await writeJson(image.runtimeDefinition, runtimeDefinition)
  const artifactTemplate = await readJson(image.artifactCatalogTemplate)
  artifactTemplate.runtimeSuiteVersion = suite.version
  await writeJson(image.artifactCatalogTemplate, artifactTemplate)
}
process.stdout.write(`synchronized Sandbox Runtime Suite ${suite.version}\n`)

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), 'utf8'))
}
async function writeJson(relativePath, value) {
  await writeFile(path.join(packageRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`)
}
