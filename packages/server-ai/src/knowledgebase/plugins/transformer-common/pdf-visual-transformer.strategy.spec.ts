import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { XpFileSystem } from '@xpert-ai/plugin-sdk'
import { PdfVisualTransformerStrategy } from './pdf-visual-transformer.strategy'
import { AutoTextSplitterStrategy } from '../textsplitter-common/auto.strategy'
import { StructureAwareStrategy } from '../textsplitter-common/structure-aware.strategy'
import { RecursiveCharacterStrategy } from '../textsplitter-common/recursive-character.strategy'
import { MarkdownRecursiveStrategy } from '../textsplitter-common/markdown-recursive.strategy'

const SECTION_ONE = 'Section One Equipment Register'
const SECTION_TWO = 'Section Two Return Record'
const SECTION_THREE = 'Section Three Handover Note'
const RUNNER_FLAG = '--pdf-visual-runner'
const RESULT_PREFIX = '__PDF_VISUAL_RESULT__'

type PdfVisualReport = {
    textChunkCount: number
    textMediaTypes: Array<string | null>
    text: string
    textContainsImageMarkdown: boolean
    imageChunks: Array<{ sourceType: string | null; pageContent: string; containsSection: boolean }>
    assets: Array<{ type?: string; sourceType?: string; page?: number; filePath?: string }>
    diagnostics: unknown
}

function escapePdfText(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildSection(title: string, sentence: string, repeat: number): string[] {
    const lines = [title, '']
    let paragraph = ''
    for (let index = 1; index <= repeat; index += 1) {
        paragraph += `${sentence} Item ${index}. `
        if (paragraph.length > 90 || index === repeat) {
            lines.push(paragraph.trim())
            paragraph = ''
        }
    }
    lines.push('')
    return lines
}

function buildPdf(options: { lines: string[]; includeText: boolean }): Buffer {
    const textOperators = options.includeText
        ? [
              'BT',
              '/F1 11 Tf',
              '40 760 Td',
              '13 TL',
              ...options.lines.flatMap((line) => [`(${escapePdfText(line)}) Tj`, 'T*']),
              'ET'
          ]
        : []
    const content = [...textOperators, 'q', '72 0 0 54 470 700 cm', '/Im1 Do', 'Q'].join('\n')
    const pixels: number[] = []
    for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
            const on = (x + y) % 2 === 0
            pixels.push(on ? 220 : 20, on ? 40 : 90, on ? 40 : 180)
        }
    }
    const image = Buffer.from(pixels)
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>',
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${image.length} >>\nstream\n${image.toString('binary')}\nendstream`
    ]
    let body = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(body))
        body += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xrefAt = Buffer.byteLength(body)
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (let index = 1; index < offsets.length; index += 1) {
        xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
    }
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
    const ascii = Buffer.from(body + xref + trailer, 'binary')
    const header = Buffer.from(`/Length ${image.length} >>\nstream\n`, 'binary')
    const headerAt = ascii.indexOf(header)
    if (headerAt < 0) throw new Error('image stream header was not written')
    image.copy(ascii, headerAt + header.length)
    return ascii
}

function createSplitter(): AutoTextSplitterStrategy {
    const recursive = new RecursiveCharacterStrategy()
    return new AutoTextSplitterStrategy(
        new StructureAwareStrategy(recursive),
        new MarkdownRecursiveStrategy(),
        recursive
    )
}

async function transformPdf(name: string, pdf: Buffer): Promise<PdfVisualReport> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xpert-pdf-visual-'))
    try {
        await fs.writeFile(path.join(directory, name), pdf)
        const fileSystem = new XpFileSystem(
            { type: 'filesystem', operations: ['read', 'write', 'list'], scope: [] },
            directory,
            'https://files.local'
        )
        const strategy = new PdfVisualTransformerStrategy()
        const [result] = await strategy.transformDocuments([{ id: 'doc-pdf', name, type: 'pdf', filePath: name }], {
            renderPageImages: true,
            maxPages: 300,
            renderScale: 2,
            stage: 'test',
            permissions: { fileSystem }
        })
        const splitter = createSplitter()
        const split = await splitter.splitDocuments(result?.chunks ?? [], { chunkSize: 1000, chunkOverlap: 0 })
        const textChunks = split.chunks.filter(
            (chunk) => (!chunk.metadata.mediaType || chunk.metadata.mediaType === 'text') && chunk.pageContent.trim()
        )
        const imageChunks = split.chunks.filter((chunk) => chunk.metadata.mediaType === 'image')
        return {
            textChunkCount: textChunks.length,
            textMediaTypes: textChunks.map((chunk) => chunk.metadata.mediaType ?? null),
            text: textChunks.map((chunk) => chunk.pageContent).join('\n'),
            textContainsImageMarkdown: textChunks.some((chunk) => chunk.pageContent.includes('![Page')),
            imageChunks: imageChunks.map((chunk) => ({
                sourceType: chunk.metadata.sourceType ?? null,
                pageContent: chunk.pageContent,
                containsSection: chunk.pageContent.includes(SECTION_ONE)
            })),
            assets: (result?.metadata?.assets ?? []).map((asset) => ({
                type: asset.type,
                sourceType: asset.sourceType,
                page: asset.page,
                filePath: asset.filePath
            })),
            diagnostics: result?.metadata?.parserDiagnostics ?? null
        }
    } finally {
        await fs.rm(directory, { recursive: true, force: true })
    }
}

async function runCase(kind: string): Promise<PdfVisualReport> {
    if (kind === 'native') {
        const lines = [
            ...buildSection(SECTION_ONE, 'Qinglu-47 was checked in and the serial stays RIGHT-936.', 12),
            ...buildSection(SECTION_TWO, 'The missing part was recorded before the equipment left.', 12),
            ...buildSection(SECTION_THREE, 'Keep the original device name instead of a description.', 12)
        ]
        return transformPdf('text-and-image.pdf', buildPdf({ lines, includeText: true }))
    }
    if (kind === 'scan') return transformPdf('scan.pdf', buildPdf({ lines: [], includeText: false }))
    throw new Error(`Unknown pdf-visual case '${kind}'`)
}

// Jest's VM cannot dynamic-import pdf-to-img. Run the real strategy in plain Node.
function runOutsideJest(kind: string): PdfVisualReport {
    const workspaceRoot = path.resolve(__dirname, '../../../../../..')
    const result = spawnSync(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', __filename, RUNNER_FLAG, kind],
        {
            cwd: workspaceRoot,
            env: {
                ...process.env,
                TS_NODE_PROJECT: path.resolve(__dirname, '../../../../tsconfig.spec.json')
            },
            encoding: 'utf8'
        }
    )
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `pdf-visual runner exited ${result.status}`)
    }
    const line = result.stdout
        .split('\n')
        .reverse()
        .find((entry) => entry.startsWith(RESULT_PREFIX))
    if (!line) throw new Error(result.stderr || result.stdout || 'pdf-visual runner returned no result')
    const parsed: unknown = JSON.parse(line.slice(RESULT_PREFIX.length))
    if (!isPdfVisualReport(parsed)) throw new Error('pdf-visual runner returned an unexpected result')
    return parsed
}

function isPdfVisualReport(value: unknown): value is PdfVisualReport {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    return (
        'textChunkCount' in value &&
        typeof value.textChunkCount === 'number' &&
        Number.isFinite(value.textChunkCount) &&
        'textMediaTypes' in value &&
        Array.isArray(value.textMediaTypes) &&
        value.textMediaTypes.every((item: unknown) => item === null || typeof item === 'string') &&
        'text' in value &&
        typeof value.text === 'string' &&
        'textContainsImageMarkdown' in value &&
        typeof value.textContainsImageMarkdown === 'boolean' &&
        'imageChunks' in value &&
        Array.isArray(value.imageChunks) &&
        value.imageChunks.every(isReportImageChunk) &&
        'assets' in value &&
        Array.isArray(value.assets) &&
        value.assets.every(isReportAsset) &&
        'diagnostics' in value
    )
}

function isReportImageChunk(value: unknown): value is PdfVisualReport['imageChunks'][number] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    return (
        'sourceType' in value &&
        (value.sourceType === null || typeof value.sourceType === 'string') &&
        'pageContent' in value &&
        typeof value.pageContent === 'string' &&
        'containsSection' in value &&
        typeof value.containsSection === 'boolean'
    )
}

function isReportAsset(value: unknown): value is PdfVisualReport['assets'][number] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    return (
        (!('type' in value) || value.type === undefined || typeof value.type === 'string') &&
        (!('sourceType' in value) || value.sourceType === undefined || typeof value.sourceType === 'string') &&
        (!('page' in value) ||
            value.page === undefined ||
            (typeof value.page === 'number' && Number.isFinite(value.page))) &&
        (!('filePath' in value) || value.filePath === undefined || typeof value.filePath === 'string')
    )
}

if (process.argv.includes(RUNNER_FLAG)) {
    const kind = process.argv[process.argv.indexOf(RUNNER_FLAG) + 1] ?? ''
    runCase(kind)
        .then((report) => {
            process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(report)}\n`)
        })
        .catch((error: unknown) => {
            process.stderr.write(error instanceof Error ? (error.stack ?? error.message) : String(error))
            process.exitCode = 1
        })
} else {
    describe('pdf-visual runner report validation', () => {
        const report: PdfVisualReport = {
            textChunkCount: 1,
            textMediaTypes: ['text', null],
            text: 'Page',
            textContainsImageMarkdown: false,
            imageChunks: [{ sourceType: 'pdf_page', pageContent: '![page](page.png)', containsSection: false }],
            assets: [{ type: 'image', sourceType: 'pdf_page', page: 1, filePath: 'page.png' }, {}],
            diagnostics: null
        }

        it('accepts a complete report including nullable and optional fields', () => {
            expect(isPdfVisualReport(report)).toBe(true)
        })

        it.each([
            { ...report, textMediaTypes: undefined },
            { ...report, textMediaTypes: ['text', 1] },
            { ...report, textChunkCount: '1' },
            { ...report, textChunkCount: Number.NaN },
            { ...report, text: null },
            { ...report, textContainsImageMarkdown: 'false' },
            { ...report, imageChunks: {} },
            { ...report, imageChunks: [null] },
            { ...report, imageChunks: [{ sourceType: 1, pageContent: '', containsSection: false }] },
            { ...report, imageChunks: [{ sourceType: null, pageContent: 1, containsSection: false }] },
            { ...report, imageChunks: [{ sourceType: null, pageContent: '', containsSection: 'false' }] },
            { ...report, assets: [{ type: 1 }] },
            { ...report, assets: [{ sourceType: false }] },
            { ...report, assets: [{ page: '1' }] },
            { ...report, assets: [{ filePath: null }] }
        ])('rejects malformed subprocess fields: %j', (value: unknown) => {
            expect(isPdfVisualReport(value)).toBe(false)
        })
    })

    describe('pdf-visual page text and page images', () => {
        it('chunks extracted page text while keeping the rendered page image', () => {
            const report = runOutsideJest('native')
            expect(report.textChunkCount).toBeGreaterThan(1)
            expect(report.textMediaTypes.every((mediaType) => mediaType === 'text')).toBe(true)
            expect(report.text).toContain(SECTION_ONE)
            expect(report.text).toContain(SECTION_TWO)
            expect(report.text).toContain(SECTION_THREE)
            expect(report.text).toContain('RIGHT-936')
            expect(report.textContainsImageMarkdown).toBe(false)
            expect(report.imageChunks).toEqual([
                expect.objectContaining({
                    sourceType: 'pdf_page',
                    containsSection: false
                })
            ])
            expect(report.imageChunks[0]?.pageContent).toMatch(/^!\[Page 1\]\(/)
            expect(report.assets).toEqual([expect.objectContaining({ type: 'image', sourceType: 'pdf_page', page: 1 })])
            expect(report.diagnostics).toEqual({
                schemaVersion: 1,
                pages: [{ page: 1, status: 'text', imagePaths: [] }]
            })
        }, 30000)

        it('keeps a page image and records needs-ocr when the page has no text layer', () => {
            const report = runOutsideJest('scan')
            const imagePath = report.assets[0]?.filePath
            expect(report.textChunkCount).toBe(0)
            expect(report.imageChunks).toHaveLength(1)
            expect(report.imageChunks[0]?.sourceType).toBe('pdf_page')
            expect(report.imageChunks[0]?.pageContent).toMatch(/^!\[Page 1\]\(/)
            expect(imagePath).toEqual(expect.any(String))
            expect(report.diagnostics).toEqual({
                schemaVersion: 1,
                pages: [{ page: 1, status: 'needs-ocr', imagePaths: [imagePath] }]
            })
        }, 30000)
    })
}
