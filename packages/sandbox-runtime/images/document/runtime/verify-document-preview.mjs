// Readiness exercises the same DOCX -> PDF -> page-text chain as document Actions.
import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execute = promisify(execFile)
async function run(command, args, timeout = 5000) {
  try {
    const result = await execute(command, args, { timeout, maxBuffer: 1024 * 1024 })
    return `${result.stdout}${result.stderr}`.trim()
  } catch (error) {
    const code =
      error.code === 'ENOENT' ? 'SANDBOX_DEPENDENCY_MISSING' : error.killed ? 'EXPORT_TIMEOUT' : 'SANDBOX_START_FAILED'
    throw new Error(`${code}: ${command}: ${error.message.slice(0, 2000)}`)
  }
}

export async function verifyDocumentPreview() {
  const sofficeVersion = await run('soffice', ['--headless', '--version'])
  const pdftotextVersion = await run('pdftotext', ['-v'])
  for (const family of ['Noto Sans CJK SC', 'Noto Color Emoji']) {
    const actual = await run('fc-match', ['-f', '%{family}', family])
    if (!actual.split(',').includes(family)) throw new Error(`SANDBOX_DEPENDENCY_MISSING: font ${family}`)
  }
  const root = await mkdtemp(path.join(tmpdir(), 'xpert-document-health-'))
  try {
    const input = path.join(root, 'health.docx')
    await copyFile(new URL('./health.docx', import.meta.url), input)
    await run(
      'soffice',
      [
        `-env:UserInstallation=${pathToFileURL(path.join(root, 'profile')).href}`,
        '--headless',
        '--nologo',
        '--nodefault',
        '--nolockcheck',
        '--nofirststartwizard',
        '--convert-to',
        'pdf',
        '--outdir',
        root,
        input
      ],
      30000
    )
    const pdf = await readFile(path.join(root, 'health.pdf'))
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('EXPORT_OUTPUT_INVALID: health PDF is invalid')
    await run('pdftotext', ['-layout', '-enc', 'UTF-8', path.join(root, 'health.pdf'), path.join(root, 'health.txt')])
    const text = await readFile(path.join(root, 'health.txt'), 'utf8')
    const pages = text.split('\f')
    if (
      pages.length !== 3 ||
      pages[2].trim() ||
      !pages[0].replace(/\s/gu, '').includes('预览验证') ||
      !pages[1].includes('Preview page two')
    ) {
      throw new Error('EXPORT_OUTPUT_INVALID: health PDF must yield two pages of UTF-8 text')
    }
    return { sofficeVersion, pdftotextVersion, totalPages: 2 }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  verifyDocumentPreview()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    })
}
