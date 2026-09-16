import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const option = (name) => args[args.indexOf(name) + 1]
const family = option('--family')
if (!['document-node', 'document-java'].includes(family)) throw new Error('Select a document Runtime family.')
const suite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = args.includes('--lock')
  ? path.resolve(option('--lock'))
  : path.join(suite, 'images', family, 'dependencies.lock.json')
const bytes = await readFile(lockPath)
const lock = JSON.parse(bytes)
const digest = createHash('sha256').update(bytes).digest('hex')
const destination = args.includes('--destination')
  ? path.resolve(option('--destination'))
  : path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'xpert', 'sandbox-runtime', family, digest)
let exists = false
try {
  await access(destination)
  exists = true
} catch {}
if (!exists && !args.includes('--verify-only')) {
  await mkdir(path.dirname(destination), { recursive: true })
  const staging = await mkdtemp(`${destination}.install-`)
  const downloads = await mkdtemp(path.join(tmpdir(), 'xpert-document-download-'))
  try {
    if (family === 'document-node') {
      const platform = `${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}`
      const native = `@firecrawl/anydoc-${platform}`
      for (const name of ['@firecrawl/anydoc', native, ...(lock.pdfPackages ?? [])]) {
        const item = lock.packages[name]
        if (!item) throw new Error(`Unsupported managed document Node platform: ${platform}`)
        const archive = path.join(downloads, name.replaceAll('/', '_') + '.tgz')
        await download(item.url, archive, item.integrity)
        const target = path.join(staging, 'node_modules', name)
        await mkdir(target, { recursive: true })
        execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', target])
        // npm tarballs can contain 0644 directories; npm normally fixes these during extraction.
        // Direct tar extraction must retain traversability for the non-root Runtime user too.
        await normalizeDirectories(target)
      }
      await writeFile(path.join(staging, 'package.json'), JSON.stringify({ private: true }))
    } else {
      const jre = lock.jre[`${process.platform}-${process.arch}`]
      if (!jre) throw new Error('Unsupported managed document Java platform.')
      const archive = path.join(downloads, 'jre.tar.gz')
      await download(jre.url, archive, `sha256-${Buffer.from(jre.sha256, 'hex').toString('base64')}`)
      const expanded = path.join(downloads, 'jre')
      await mkdir(expanded)
      execFileSync('tar', ['-xzf', archive, '-C', expanded])
      const entries = await readdir(expanded)
      if (entries.length !== 1) throw new Error('Unexpected JRE archive layout.')
      const javaHome = path.join(expanded, entries[0], ...(process.platform === 'darwin' ? ['Contents', 'Home'] : []))
      await rename(javaHome, path.join(staging, 'jre'))
      const cli = path.join(downloads, 'cli.zip')
      await download(lock.cli.url, cli, `sha256-${Buffer.from(lock.cli.sha256, 'hex').toString('base64')}`)
      const cliRoot = path.join(staging, 'cli')
      await mkdir(cliRoot)
      execFileSync('unzip', ['-q', cli, '-d', cliRoot])
      const jar = await readFile(path.join(cliRoot, lock.cli.jar))
      if (createHash('sha256').update(jar).digest('hex') !== lock.cli.jarSha256)
        throw new Error('CLI JAR integrity mismatch.')
      if (lock.ocr)
        await (
          await import('./install-document-ocr.mjs')
        ).installDocumentOcr({
          root: staging,
          familyRoot: path.dirname(lockPath),
          lock,
          download,
          downloads,
          python: args.includes('--python') ? option('--python') : undefined
        })
    }
    await copyFile(lockPath, path.join(staging, 'dependencies.lock.json'))
    await chmod(staging, 0o755)
    // Publish only a complete installation. Existing versioned caches are never overwritten.
    await rename(staging, destination)
  } finally {
    await rm(staging, { recursive: true, force: true })
    await rm(downloads, { recursive: true, force: true })
  }
}
if (!args.includes('--destination')) {
  execFileSync(
    process.execPath,
    [
      path.join(suite, 'scripts/verify-document-runtime.mjs'),
      path.join(suite, 'images', family, 'runtime/manifest.json'),
      lockPath,
      destination
    ],
    { stdio: 'inherit', timeout: 60000 }
  )
}
process.stdout.write(`Document Runtime dependencies: ${destination}\n`)

async function normalizeDirectories(directory) {
  await chmod(directory, 0o755)
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await normalizeDirectories(path.join(directory, entry.name))
  }
}

async function download(url, output, integrity) {
  if (!url.startsWith('https://')) throw new Error('Runtime downloads require HTTPS.')
  execFileSync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--proto',
      '=https',
      '--proto-redir',
      '=https',
      '--max-time',
      '180',
      '--output',
      output,
      url
    ],
    { stdio: 'inherit', timeout: 190000 }
  )
  const [algorithm, expected] = integrity.split('-', 2)
  if (
    !['sha256', 'sha512'].includes(algorithm) ||
    createHash(algorithm)
      .update(await readFile(output))
      .digest('base64') !== expected
  )
    throw new Error('Runtime download integrity mismatch.')
}
