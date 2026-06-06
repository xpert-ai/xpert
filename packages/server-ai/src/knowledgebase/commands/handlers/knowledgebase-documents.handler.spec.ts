import archiver from 'archiver'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { RequestContext } from '@xpert-ai/server-core'
import {
    DeleteKnowledgebaseDocumentsCommand,
    ImportKnowledgebaseArchiveCommand
} from '../knowledgebase-documents.command'
import {
    DeleteKnowledgebaseDocumentsHandler,
    ImportKnowledgebaseArchiveHandler
} from './knowledgebase-documents.handler'

describe('ImportKnowledgebaseArchiveHandler', () => {
    const tempDirs: string[] = []

    afterEach(async () => {
        jest.restoreAllMocks()
        await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    })

    it('recursively imports supported files from nested zip archives', async () => {
        const tempRoot = await mkdtemp(path.join(tmpdir(), 'kb-archive-import-'))
        tempDirs.push(tempRoot)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')

        const createdDrafts: any[] = []
        const knowledgebaseService = {
            assertNotRebuilding: jest.fn()
        }
        const documentService = {
            createBulk: jest.fn(async (drafts: any[]) => {
                createdDrafts.push(...drafts)
                return drafts.map((draft, index) => ({
                    ...draft,
                    id: `doc-${index + 1}`,
                    status: 'waiting'
                }))
            }),
            startProcessing: jest.fn(async () => []),
            findAncestors: jest.fn()
        }
        const workAreaResolver = {
            resolve: jest.fn(async () => ({
                volume: {
                    path: (filePath: string) => path.join(tempRoot, filePath),
                    publicUrl: (filePath: string) => `https://files.example/${filePath}`
                }
            })),
            getFilesPath: jest.fn((folder: string) => path.posix.join('files', folder || ''))
        }
        const innerZip = await createZipBuffer({
            'spec.pdf': 'pdf-content',
            'sheet.xlsx': 'sheet-content'
        })
        const outerZip = await createZipBuffer({
            'docs/contract.docx': 'docx-content',
            'attachments/inner.zip': innerZip,
            'attachments/nested.rar': Buffer.from('rar-content'),
            '__MACOSX/ignored.txt': 'ignored'
        })
        const handler = new ImportKnowledgebaseArchiveHandler(
            knowledgebaseService as any,
            documentService as any,
            workAreaResolver as any
        )

        const result = await handler.execute(
            new ImportKnowledgebaseArchiveCommand({
                knowledgebaseId: 'kb-1',
                file: {
                    buffer: outerZip,
                    originalname: 'package.zip',
                    mimetype: 'application/zip',
                    size: outerZip.length
                },
                path: 'reference',
                packageCode: 'PKG-1',
                process: true
            })
        )

        expect(createdDrafts.map((draft) => draft.metadata.archiveEntryPath).sort()).toEqual([
            'attachments/inner/sheet.xlsx',
            'attachments/inner/spec.pdf',
            'docs/contract.docx'
        ])
        expect(
            createdDrafts.map((draft) => ({
                path: draft.metadata.archiveEntryPath,
                parserConfig: draft.parserConfig
            }))
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: 'attachments/inner/spec.pdf',
                    parserConfig: expect.objectContaining({
                        transformerType: 'pdf-visual',
                        transformer: expect.objectContaining({
                            renderPageImages: true,
                            maxPages: 300,
                            renderScale: 2
                        }),
                        textSplitterType: 'recursive-character',
                        textSplitter: expect.objectContaining({
                            chunkSize: 1000,
                            chunkOverlap: 200
                        })
                    })
                }),
                expect.objectContaining({
                    path: 'attachments/inner/sheet.xlsx',
                    parserConfig: {}
                }),
                expect.objectContaining({
                    path: 'docs/contract.docx',
                    parserConfig: expect.objectContaining({
                        transformerType: 'default',
                        textSplitterType: 'recursive-character'
                    })
                })
            ])
        )
        expect(createdDrafts.map((draft) => draft.name).sort()).toEqual(['contract.docx', 'sheet.xlsx', 'spec.pdf'])
        expect(createdDrafts.every((draft) => draft.metadata.archivePath === result.archive.filePath)).toBe(true)
        expect(result.documents).toHaveLength(3)
        expect(result.skipped).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: 'attachments/nested.rar',
                    reason: expect.stringContaining('Nested archive type .rar is not supported')
                }),
                expect.objectContaining({
                    path: '__MACOSX/ignored.txt',
                    reason: 'Unsafe or hidden archive entry path.'
                })
            ])
        )
        expect(documentService.startProcessing).toHaveBeenCalledWith(['doc-1', 'doc-2', 'doc-3'], 'kb-1')
        await expect(
            readFile(path.join(tempRoot, 'files/reference/package/attachments/inner/spec.pdf'), 'utf8')
        ).resolves.toBe('pdf-content')
    })

    it('imports tar.gz archives and recursively expands nested zip files', async () => {
        const tempRoot = await mkdtemp(path.join(tmpdir(), 'kb-archive-import-'))
        tempDirs.push(tempRoot)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')

        const createdDrafts: any[] = []
        const handler = new ImportKnowledgebaseArchiveHandler(
            {
                assertNotRebuilding: jest.fn()
            } as any,
            {
                createBulk: jest.fn(async (drafts: any[]) => {
                    createdDrafts.push(...drafts)
                    return drafts.map((draft, index) => ({
                        ...draft,
                        id: `doc-${index + 1}`,
                        status: 'waiting'
                    }))
                }),
                startProcessing: jest.fn(async () => []),
                findAncestors: jest.fn()
            } as any,
            {
                resolve: jest.fn(async () => ({
                    volume: {
                        path: (filePath: string) => path.join(tempRoot, filePath),
                        publicUrl: (filePath: string) => `https://files.example/${filePath}`
                    }
                })),
                getFilesPath: jest.fn((folder: string) => path.posix.join('files', folder || ''))
            } as any
        )
        const nestedZip = await createZipBuffer({
            'spec.pdf': 'nested-pdf'
        })
        const archiveBuffer = await createArchiveBuffer(
            'tar',
            {
                'bundle/readme.pdf': 'tar-pdf',
                'bundle/nested.zip': nestedZip
            },
            { gzip: true }
        )

        await handler.execute(
            new ImportKnowledgebaseArchiveCommand({
                knowledgebaseId: 'kb-1',
                file: {
                    buffer: archiveBuffer,
                    originalname: 'package.tar.gz',
                    mimetype: 'application/gzip',
                    size: archiveBuffer.length
                },
                path: 'reference',
                packageCode: 'PKG-1'
            })
        )

        expect(createdDrafts.map((draft) => draft.metadata.archiveEntryPath).sort()).toEqual([
            'bundle/nested/spec.pdf',
            'bundle/readme.pdf'
        ])
        await expect(
            readFile(path.join(tempRoot, 'files/reference/package/bundle/nested/spec.pdf'), 'utf8')
        ).resolves.toBe('nested-pdf')
    })
})

describe('DeleteKnowledgebaseDocumentsHandler', () => {
    it('deletes matched documents through KnowledgeDocumentService.deleteBulk', async () => {
        const documentService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'doc-1',
                        knowledgebaseId: 'kb-1'
                    }
                ]
            })),
            deleteBulk: jest.fn()
        }
        const handler = new DeleteKnowledgebaseDocumentsHandler(documentService as any)

        const result = await handler.execute(
            new DeleteKnowledgebaseDocumentsCommand({
                knowledgebaseId: 'kb-1',
                documentIds: ['doc-1', 'doc-missing', 'doc-1']
            })
        )

        expect(documentService.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    knowledgebaseId: 'kb-1'
                })
            })
        )
        expect(documentService.deleteBulk).toHaveBeenCalledWith(['doc-1'])
        expect(result).toEqual({
            knowledgebaseId: 'kb-1',
            documentIds: ['doc-1'],
            deletedDocumentCount: 1,
            missingDocumentIds: ['doc-missing']
        })
    })
})

async function createZipBuffer(entries: Record<string, string | Buffer>) {
    return createArchiveBuffer('zip', entries, { zlib: { level: 9 } })
}

async function createArchiveBuffer(
    format: 'zip' | 'tar',
    entries: Record<string, string | Buffer>,
    options: archiver.ArchiverOptions
) {
    const archive = archiver(format, options)
    const stream = new PassThrough()
    const chunks: Buffer[] = []

    stream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    const result = new Promise<Buffer>((resolve, reject) => {
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
        archive.on('error', reject)
    })

    archive.pipe(stream)
    for (const [name, content] of Object.entries(entries)) {
        archive.append(content, { name })
    }
    await archive.finalize()
    return result
}
