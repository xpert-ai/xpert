#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const hostFile = fileURLToPath(import.meta.url)
const runtimeRoot = path.dirname(hostFile)
const requireFromHost = createRequire(import.meta.url)
const manifestPath = process.env.XPERT_SANDBOX_RUNTIME_MANIFEST_PATH
  ? path.resolve(process.env.XPERT_SANDBOX_RUNTIME_MANIFEST_PATH)
  : path.join(runtimeRoot, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

if (process.argv.includes('--manifest')) {
  process.stdout.write(`${JSON.stringify(await runtimeManifest())}\n`)
  process.exit(0)
}

if (process.argv.includes('--browser-smoke')) {
  await browserSmoke()
  process.exit(0)
}

if (process.argv.includes('--browser-health')) {
  await browserHealth()
  process.exit(0)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${classify(message)}: ${message}\n`)
  process.exit(1)
})

async function main() {
  await prepareWritableRuntime()
  const requestPath = requiredPath('--request')
  const outputPath = requiredPath('--output')
  const actionRoot = requiredPath('--action-root')
  const actionManifestPath = requiredPath('--action-manifest')
  const action = parseActionManifest(JSON.parse(await readFile(actionManifestPath, 'utf8')))
  const rootRealPath = await realpath(actionRoot)
  const entrypoint = path.resolve(rootRealPath, action.entrypoint)
  if (!isWithin(rootRealPath, entrypoint))
    throw new Error('SANDBOX_ACTION_INVALID: action entrypoint escapes bundle root.')
  const entrypointStat = await lstat(entrypoint)
  if (!entrypointStat.isFile() || entrypointStat.isSymbolicLink()) {
    throw new Error('SANDBOX_ACTION_INVALID: action entrypoint must be a regular file.')
  }
  await exposeRuntimeDependencies(rootRealPath)
  await execute(process.execPath, [entrypoint, '--request', requestPath, '--output', outputPath], rootRealPath)
}

function parseActionManifest(value) {
  if (!isObject(value) || value.runtimeContractVersion !== manifest.contractVersion) {
    throw new Error('SANDBOX_ACTION_INVALID: action runtime contract is incompatible.')
  }
  if (typeof value.name !== 'string' || typeof value.version !== 'string' || typeof value.entrypoint !== 'string') {
    throw new Error('SANDBOX_ACTION_INVALID: action manifest is incomplete.')
  }
  if (value.playwrightVersion && value.playwrightVersion !== manifest.playwrightVersion) {
    throw new Error('SANDBOX_ACTION_INVALID: action Playwright version is incompatible.')
  }
  return value
}

async function exposeRuntimeDependencies(actionRoot) {
  const dependencyRoot = path.join(actionRoot, 'node_modules')
  await mkdir(dependencyRoot, { recursive: true })
  const playwrightTarget = path.dirname(requireFromHost.resolve('playwright-core/package.json'))
  const playwrightLink = path.join(dependencyRoot, 'playwright-core')
  await symlink(playwrightTarget, playwrightLink, 'dir').catch(async (error) => {
    if (!isAlreadyExists(error)) throw error
    const existingTarget = await realpath(playwrightLink).catch(() => '')
    if (existingTarget !== (await realpath(playwrightTarget))) {
      throw new Error('SANDBOX_ACTION_INVALID: action cannot override Runtime-provided playwright-core.')
    }
  })
}

async function runtimeManifest() {
  const packageJsonPath = requireFromHost.resolve('playwright-core/package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const browsers = JSON.parse(await readFile(path.join(path.dirname(packageJsonPath), 'browsers.json'), 'utf8'))
  const chromium = Array.isArray(browsers.browsers)
    ? (browsers.browsers.find((entry) => entry?.name === 'chromium-headless-shell') ??
      browsers.browsers.find((entry) => entry?.name === 'chromium'))
    : undefined
  const result = {
    ...manifest,
    nodeVersion: process.versions.node,
    playwrightVersion: String(packageJson.version ?? 'unknown'),
    browserRevision: chromium?.revision ? String(chromium.revision) : 'unknown',
    runnerHostSha256: createHash('sha256')
      .update(await readFile(hostFile))
      .digest('hex')
  }
  if (manifest.ffmpegVersion) result.ffmpegVersion = await ffmpegVersion(manifest.ffmpegVersion)
  return result
}

async function ffmpegVersion(declaredVersion) {
  const output = await commandOutput('ffmpeg', ['-version'])
  const version = /^ffmpeg version n?(\d+(?:\.\d+)+)/m.exec(output)?.[1]
  if (!version) throw new Error('EXPORT_MEDIA_FAILED: FFmpeg version could not be determined.')
  const precision = String(declaredVersion).split('.').length
  return version.split('.').slice(0, precision).join('.')
}

function commandOutput(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output = appendOutput(output, chunk)
    })
    child.stderr.on('data', (chunk) => {
      output = appendOutput(output, chunk)
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(output.trim() || `${command} exited with code ${code ?? 'null'}.`))
    })
  })
}

async function browserSmoke() {
  await prepareWritableRuntime()
  const { chromium } = await import('playwright-core')
  const browser = await chromium
    .launch({
      headless: true,
      args: ['--disable-gpu', '--disable-software-rasterizer']
    })
    .catch((error) => {
      throw new Error(`BROWSER_LAUNCH_FAILED: ${error instanceof Error ? error.message : String(error)}`)
    })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.setContent(
      '<!doctype html><meta charset="utf-8"><style>body{font-family:"Noto Sans CJK SC","Noto Color Emoji",sans-serif}</style><h1>Sandbox 浏览器 ✅</h1>'
    )
    await page.evaluate(() => document.fonts.ready)
    const pdf = await page.pdf({ width: '1280px', height: '720px', printBackground: true })
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('EXPORT_OUTPUT_INVALID: PDF header is invalid.')
    const text = await page.locator('h1').textContent()
    if (text !== 'Sandbox 浏览器 ✅') throw new Error('EXPORT_OUTPUT_INVALID: browser text smoke failed.')
    process.stdout.write(
      `${JSON.stringify({ chromium: true, pdfBytes: pdf.length, text, uid: process.getuid?.() ?? null })}\n`
    )
  } finally {
    await browser.close()
  }
}

async function browserHealth() {
  const { chromium } = await import('playwright-core')
  const browser = await chromium
    .launch({ headless: true, args: ['--disable-gpu', '--disable-software-rasterizer'] })
    .catch((error) => {
      throw new Error(`BROWSER_LAUNCH_FAILED: ${error instanceof Error ? error.message : String(error)}`)
    })
  try {
    process.stdout.write(`${JSON.stringify({ available: true, version: browser.version() })}\n`)
  } finally {
    await browser.close()
  }
}

async function prepareWritableRuntime() {
  await Promise.all([
    mkdir(process.env.HOME || '/tmp/xpert/home', { recursive: true }),
    mkdir(process.env.XDG_CACHE_HOME || '/tmp/xpert/cache', { recursive: true })
  ])
}

function execute(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output = appendOutput(output, chunk)
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output = appendOutput(output, chunk)
      process.stderr.write(chunk)
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(output.trim() || `Action exited with code ${code ?? 'null'} signal ${signal ?? 'none'}.`))
    })
  })
}

function requiredPath(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`SANDBOX_ACTION_INVALID: ${name} is required.`)
  return path.resolve(value)
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function appendOutput(current, chunk) {
  const next = `${current}${String(chunk)}`
  return next.length > 4 * 1024 * 1024 ? next.slice(-4 * 1024 * 1024) : next
}

function classify(message) {
  const normalized = message.toUpperCase()
  if (normalized.includes('SANDBOX_ACTION_INVALID')) return 'SANDBOX_ACTION_INVALID'
  if (normalized.includes('EXPORT_OUTPUT_INVALID')) return 'EXPORT_OUTPUT_INVALID'
  if (normalized.includes('EXPORT_MEDIA_FAILED')) return 'EXPORT_MEDIA_FAILED'
  if (normalized.includes('EXPORT_INPUT_INVALID')) return 'EXPORT_INPUT_INVALID'
  if (normalized.includes('BROWSER') || normalized.includes('CHROMIUM') || normalized.includes('PLAYWRIGHT'))
    return 'BROWSER_LAUNCH_FAILED'
  if (normalized.includes('ENOMEM') || normalized.includes('OUT OF MEMORY') || normalized.includes('OOM'))
    return 'EXPORT_OOM'
  return 'SANDBOX_START_FAILED'
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAlreadyExists(error) {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}
