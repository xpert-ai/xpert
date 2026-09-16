import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, mkdtemp, rm, writeFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Installation verifies model contents and conversion. Frequent readiness checks
// retain version/asset checks and real OCR CPU execution without rereading all weights.
const [manifestPath, lockPath, root, mode] = process.argv.slice(2)
if (mode && mode !== '--readiness') throw new Error(`Unknown document Runtime verification mode: ${mode}`)
const readinessOnly = mode === '--readiness'
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const bytes = await readFile(lockPath)
const lock = JSON.parse(bytes)
if (process.versions.node !== manifest.nodeVersion)
  throw new Error(`Expected Node ${manifest.nodeVersion}; got ${process.versions.node}.`)
if (
  createHash('sha256').update(bytes).digest('hex') !== manifest.dependenciesSha256 ||
  !bytes.equals(await readFile(path.join(root, 'dependencies.lock.json')))
)
  throw new Error('Document dependency lock mismatch.')
if (manifest.imageFamily === 'document-node') {
  const require = createRequire(path.join(root, 'package.json'))
  const pkg = require('@firecrawl/anydoc/package.json')
  if (pkg.version !== manifest.anydocVersion || pkg.version !== lock.anydocVersion)
    throw new Error('AnyDoc version mismatch.')
  const anydoc = require('@firecrawl/anydoc')
  const result = await anydoc.toMarkdownBytes(
    Buffer.from('name,value\nRUNTIME_HEALTH,42\n'),
    anydoc.formatFromExtension('csv'),
    { ocr: 'reject' }
  )
  if (!result.includes('RUNTIME_HEALTH')) throw new Error('Native document conversion failed.')
  // Verify the real page isolation and renderer used for scanned/mixed PDFs, not just CSV parsing.
  if (lock.pdfPackages?.length) {
    const { PDFDocument } = require('pdf-lib')
    const { PDFiumLibrary } = require('@hyzyla/pdfium')
    const { PNG } = require('pngjs')
    const source = await PDFDocument.load(Buffer.from(samplePdf()))
    const target = await PDFDocument.create()
    target.addPage((await target.copyPages(source, [0]))[0])
    const pdfBytes = await target.save()
    const text = await anydoc.toMarkdownBytes(pdfBytes, anydoc.formatFromExtension('pdf'), { ocr: 'reject' })
    if (!text.includes('RUNTIME_HEALTH')) throw new Error('PDF page isolation failed.')
    const library = await PDFiumLibrary.init()
    try {
      const document = await library.loadDocument(pdfBytes)
      try {
        const bitmap = await document.getPage(0).render({ scale: 0.2, render: 'bitmap' })
        const png = new PNG({ width: bitmap.width, height: bitmap.height })
        png.data = Buffer.from(bitmap.data)
        const encoded = PNG.sync.write(png)
        if (PNG.sync.read(encoded).width < 1) throw new Error('PDF page rendering failed.')
      } finally {
        document.destroy()
      }
    } finally {
      library.destroy()
    }
  }
} else if (manifest.imageFamily === 'document-java') {
  const java = path.join(root, 'jre/bin/java')
  execFileSync(java, ['-version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 })
  // -version writes to stderr on HotSpot, use the release file for the exact pinned version as well.
  const release = await readFile(path.join(root, 'jre/release'), 'utf8')
  if (!release.includes(`JAVA_VERSION="${manifest.javaVersion}"`) || lock.javaVersion !== manifest.javaVersion)
    throw new Error('Java version mismatch.')
  const jar = path.join(root, 'cli', lock.cli.jar)
  if (
    createHash('sha256')
      .update(await readFile(jar))
      .digest('hex') !== lock.cli.jarSha256 ||
    lock.cli.version !== manifest.opendataloaderVersion
  )
    throw new Error('OpenDataLoader JAR mismatch.')
  if (lock.ocr) {
    for (const [file, expected] of [
      ['requirements.txt', lock.ocr.requirementsSha256],
      ['models.lock.json', lock.ocr.modelsSha256],
      ['hybrid-backend.py', lock.ocr.backendSha256]
    ]) {
      if ((await fileSha(path.join(root, file))) !== expected) throw new Error(`OCR Runtime artifact mismatch: ${file}`)
    }
    const versions = JSON.parse(
      execFileSync(
        path.join(root, 'python/bin/python3'),
        [
          '-I',
          '-c',
          'import sys,json,importlib.metadata as m; print(json.dumps([".".join(map(str,sys.version_info[:3])), m.version("opendataloader-pdf"), m.version("docling")]))'
        ],
        { encoding: 'utf8', timeout: 10000 }
      )
    )
    if (
      JSON.stringify(versions) !==
      JSON.stringify([lock.ocr.pythonVersion, lock.ocr.opendataloaderVersion, lock.ocr.doclingVersion])
    )
      throw new Error('OCR Python dependency version mismatch.')
    const catalog = JSON.parse(await readFile(path.join(root, 'models.lock.json'), 'utf8'))
    for (const model of catalog.files) {
      const file = path.join(root, 'models', model.path)
      if ((await stat(file)).size !== model.size || (!readinessOnly && (await fileSha(file)) !== model.sha256))
        throw new Error(`OCR model missing or invalid: ${model.path}`)
    }
    execFileSync(
      path.join(root, 'python/bin/python3'),
      [
        '-I',
        '-c',
        'import runpy,sys; runpy.run_path(sys.argv[1])["verify_cpu"]()',
        path.join(root, 'hybrid-backend.py')
      ],
      {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, OMP_NUM_THREADS: '2', MKL_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' }
      }
    )
  }
  if (!readinessOnly) {
    await mkdir(tmpdir(), { recursive: true })
    const directory = await mkdtemp(path.join(tmpdir(), 'xpert-java-health-'))
    try {
      await writeFile(path.join(directory, 'health.pdf'), samplePdf())
      execFileSync(
        java,
        [
          '-Djava.awt.headless=true',
          `-Djava.io.tmpdir=${directory}`,
          '-Xmx512m',
          '-jar',
          jar,
          '--format',
          'markdown,json',
          '--hybrid',
          'off',
          '--quiet',
          '--output-dir',
          directory,
          path.join(directory, 'health.pdf')
        ],
        { timeout: 30000, maxBuffer: 1024 * 1024 }
      )
      if (!(await readFile(path.join(directory, 'health.md'), 'utf8')).includes('RUNTIME_HEALTH'))
        throw new Error('Java document conversion failed.')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
} else throw new Error('Unknown document Runtime family.')
process.stdout.write('Managed document Runtime health passed.\n')

async function fileSha(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}

function samplePdf() {
  const stream = 'BT /F1 18 Tf 40 740 Td (RUNTIME_HEALTH) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const start = Buffer.byteLength(pdf)
  return (
    pdf +
    `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
      .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  )
}
