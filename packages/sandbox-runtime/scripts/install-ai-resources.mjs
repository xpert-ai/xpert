#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const catalogPath = path.resolve(argument('--catalog'))
const catalogBytes = await readFile(catalogPath)
const catalogSha256 = sha256(catalogBytes)
const expectedCatalogSha256 = optionalArgument('--catalog-sha256')?.toLowerCase()
if (expectedCatalogSha256 && catalogSha256 !== expectedCatalogSha256) {
  throw new Error(
    `browser-ai resource catalog SHA-256 mismatch: expected ${expectedCatalogSha256}, received ${catalogSha256}.`
  )
}

const catalog = parseCatalog(JSON.parse(catalogBytes.toString('utf8')))
const outputRoot = path.resolve(optionalArgument('--output') ?? defaultOutputRoot(catalog.runtimeSuiteVersion))
const requestedKeys = argumentsFor('--resource')
const resources = requestedKeys.length
  ? requestedKeys.map((key) => requireResource(catalog.resources, key))
  : catalog.resources
const verifyOnly = process.argv.includes('--verify-only')
let downloadedFiles = 0

for (const resource of resources) {
  const resourceRoot = resolveRelative(outputRoot, resource.path, `resource ${resource.key}`)
  for (const file of resource.files) {
    const target = resolveRelative(resourceRoot, file.path, `resource file ${resource.key}/${file.path}`)
    if (await validFile(target, file)) continue
    if (verifyOnly) throw new Error(`browser-ai resource is missing or corrupt: ${resource.key}/${file.path}`)
    await mkdir(path.dirname(target), { recursive: true })
    await downloadVerifiedFile(file, target)
    downloadedFiles += 1
  }
  const treeHash = treeSha256(resource.files)
  if (treeHash !== resource.treeSha256) {
    throw new Error(`browser-ai resource tree hash mismatch for ${resource.key}.`)
  }
}

if (!verifyOnly) {
  await mkdir(outputRoot, { recursive: true })
  await writeFile(path.join(outputRoot, 'catalog.json'), catalogBytes)
  await writeFile(
    path.join(outputRoot, '.installed.json'),
    `${JSON.stringify({ catalogSha256, runtimeSuiteVersion: catalog.runtimeSuiteVersion, resources: resources.map(({ key }) => key) }, null, 2)}\n`
  )
}
process.stdout.write(
  `${JSON.stringify({ root: outputRoot, catalogSha256, resources: resources.map(({ key }) => key), downloadedFiles })}\n`
)

async function downloadVerifiedFile(file, target) {
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  await rm(temporary, { force: true })
  try {
    const response = await fetch(file.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(300_000)
    })
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const hash = createHash('sha256')
    let size = 0
    const verifier = new Transform({
      transform(chunk, _encoding, callback) {
        const content = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += content.length
        hash.update(content)
        callback(null, content)
      }
    })
    await pipeline(Readable.fromWeb(response.body), verifier, createWriteStream(temporary, { mode: 0o600 }))
    const digest = hash.digest('hex')
    if (size !== file.size || digest !== file.sha256) {
      throw new Error(`expected ${file.size}/${file.sha256}, received ${size}/${digest}`)
    }
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw new Error(`Unable to install pinned browser-ai resource ${file.path}: ${messageOf(error)}`)
  }
}

async function validFile(filePath, expected) {
  const details = await stat(filePath).catch(() => null)
  if (!details?.isFile() || details.size !== expected.size) return false
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex') === expected.sha256
}

function parseCatalog(value) {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    typeof value.runtimeSuiteVersion !== 'string' ||
    !Array.isArray(value.resources)
  ) {
    throw new Error('browser-ai resource catalog is invalid.')
  }
  const keys = new Set()
  const resources = value.resources.map((item, resourceIndex) => {
    if (
      !isObject(item) ||
      typeof item.key !== 'string' ||
      !item.key ||
      keys.has(item.key) ||
      (item.type !== 'model' && item.type !== 'onnxruntime') ||
      typeof item.path !== 'string' ||
      typeof item.treeSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(item.treeSha256) ||
      !Array.isArray(item.files) ||
      !item.files.length
    ) {
      throw new Error(`browser-ai resource catalog entry ${resourceIndex} is invalid.`)
    }
    safeRelativePath(item.path, `resource ${item.key}`)
    keys.add(item.key)
    const filePaths = new Set()
    const files = item.files.map((file, fileIndex) => {
      if (
        !isObject(file) ||
        typeof file.path !== 'string' ||
        filePaths.has(file.path) ||
        typeof file.url !== 'string' ||
        !safeResourceUrl(file.url) ||
        !Number.isSafeInteger(file.size) ||
        file.size <= 0 ||
        typeof file.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(file.sha256)
      ) {
        throw new Error(`browser-ai resource file ${resourceIndex}/${fileIndex} is invalid.`)
      }
      safeRelativePath(file.path, `resource file ${item.key}/${file.path}`)
      filePaths.add(file.path)
      return { path: file.path, url: file.url, size: file.size, sha256: file.sha256.toLowerCase() }
    })
    return { ...item, files, treeSha256: item.treeSha256.toLowerCase() }
  })
  return { version: 1, runtimeSuiteVersion: value.runtimeSuiteVersion, resources }
}

function requireResource(resources, key) {
  const resource = resources.find((candidate) => candidate.key === key)
  if (!resource) throw new Error(`Unknown browser-ai resource key: ${key}`)
  return resource
}

function safeRelativePath(value, field) {
  if (!value || value.includes('\0') || path.isAbsolute(value)) throw new Error(`${field} path is invalid.`)
  const parts = value.split(/[\\/]/)
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`${field} path is invalid.`)
  return parts.join(path.sep)
}

function resolveRelative(root, value, field) {
  const target = path.resolve(root, safeRelativePath(value, field))
  const relative = path.relative(path.resolve(root), target)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${field} escapes its resource root.`)
  }
  return target
}

function safeResourceUrl(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname))
    )
  } catch {
    return false
  }
}

function treeSha256(files) {
  const hash = createHash('sha256')
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(`${file.path}\0${file.size}\0${file.sha256}\n`)
  }
  return hash.digest('hex')
}

function defaultOutputRoot(runtimeSuiteVersion) {
  const cacheRoot = process.env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), '.cache')
  return path.join(cacheRoot, 'xpert', 'sandbox-runtime', 'browser-ai', runtimeSuiteVersion, 'artifacts')
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function argument(name) {
  const value = optionalArgument(name)
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function optionalArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function argumentsFor(name) {
  const values = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1])
  }
  return values
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
