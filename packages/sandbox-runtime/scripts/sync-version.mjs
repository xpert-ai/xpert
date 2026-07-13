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
  const manifest = await readJson(image.manifest)
  manifest.sandboxRuntimeVersion = suite.version
  await writeJson(image.manifest, manifest)
  const runtimeDefinition = await readJson(image.runtimeDefinition)
  runtimeDefinition.sandboxRuntimeVersion = suite.version
  if (runtimeDefinition.expectedManifest) runtimeDefinition.expectedManifest.sandboxRuntimeVersion = suite.version
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
