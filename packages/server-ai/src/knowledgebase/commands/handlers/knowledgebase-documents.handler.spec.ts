import archiver from 'archiver'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { crc32 } from 'node:zlib'
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

        const createdDrafts: any[] = []
        const knowledgebaseService = {
            assertNotRebuilding: jest.fn()
        }
        const documentService = {
            createBulkWithIncrementalSync: jest.fn(async (drafts: any[]) => {
                createdDrafts.push(...drafts)
                const documents = drafts.map((draft, index) => ({
                    ...draft,
                    id: `doc-${index + 1}`,
                    status: 'waiting'
                }))
                return {
                    documents,
                    processableIds: documents.map((doc) => doc.id),
                    skippedIds: [],
                    updatedIds: [],
                    createdIds: documents.map((doc) => doc.id)
                }
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
        const commandBus = createUploadCommandBus(tempRoot)
        const handler = new ImportKnowledgebaseArchiveHandler(
            knowledgebaseService as any,
            documentService as any,
            workAreaResolver as any,
            commandBus as any
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

        const createdDrafts: any[] = []
        const commandBus = createUploadCommandBus(tempRoot)
        const handler = new ImportKnowledgebaseArchiveHandler(
            {
                assertNotRebuilding: jest.fn()
            } as any,
            {
                createBulkWithIncrementalSync: jest.fn(async (drafts: any[]) => {
                    createdDrafts.push(...drafts)
                    const documents = drafts.map((draft, index) => ({
                        ...draft,
                        id: `doc-${index + 1}`,
                        status: 'waiting'
                    }))
                    return {
                        documents,
                        processableIds: documents.map((doc) => doc.id),
                        skippedIds: [],
                        updatedIds: [],
                        createdIds: documents.map((doc) => doc.id)
                    }
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
            } as any,
            commandBus as any
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

    it('imports zip entries with GB18030 encoded Chinese names', async () => {
        const tempRoot = await mkdtemp(path.join(tmpdir(), 'kb-archive-import-'))
        tempDirs.push(tempRoot)

        const createdDrafts: any[] = []
        const commandBus = createUploadCommandBus(tempRoot)
        const handler = new ImportKnowledgebaseArchiveHandler(
            {
                assertNotRebuilding: jest.fn()
            } as any,
            {
                createBulkWithIncrementalSync: jest.fn(async (drafts: any[]) => {
                    createdDrafts.push(...drafts)
                    const documents = drafts.map((draft, index) => ({
                        ...draft,
                        id: `doc-${index + 1}`,
                        status: 'waiting'
                    }))
                    return {
                        documents,
                        processableIds: documents.map((doc) => doc.id),
                        skippedIds: [],
                        updatedIds: [],
                        createdIds: documents.map((doc) => doc.id)
                    }
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
            } as any,
            commandBus as any
        )
        const archiveBuffer = createStoredZipBuffer([
            {
                rawPath: Buffer.from('c4bfc2bc2f3235433133303837bbaac9fdbacfcdac2e786c7378', 'hex'),
                content: Buffer.from('sheet-content')
            }
        ])

        await handler.execute(
            new ImportKnowledgebaseArchiveCommand({
                knowledgebaseId: 'kb-1',
                file: {
                    buffer: archiveBuffer,
                    originalname: 'package.zip',
                    mimetype: 'application/zip',
                    size: archiveBuffer.length
                },
                path: 'reference',
                packageCode: 'PKG-1'
            })
        )

        expect(createdDrafts).toHaveLength(1)
        expect(createdDrafts[0]).toEqual(
            expect.objectContaining({
                name: '25C13087华升合同.xlsx',
                filePath: 'files/reference/package/目录/25C13087华升合同.xlsx',
                metadata: expect.objectContaining({
                    archiveEntryPath: '目录/25C13087华升合同.xlsx'
                })
            })
        )
        await expect(
            readFile(path.join(tempRoot, 'files/reference/package/目录/25C13087华升合同.xlsx'), 'utf8')
        ).resolves.toBe('sheet-content')
    })

    it('repairs mojibake uploaded archive names before building extracted file paths', async () => {
        const tempRoot = await mkdtemp(path.join(tmpdir(), 'kb-archive-import-'))
        tempDirs.push(tempRoot)

        const createdDrafts: any[] = []
        const commandBus = createUploadCommandBus(tempRoot)
        const handler = new ImportKnowledgebaseArchiveHandler(
            {
                assertNotRebuilding: jest.fn()
            } as any,
            {
                createBulkWithIncrementalSync: jest.fn(async (drafts: any[]) => {
                    createdDrafts.push(...drafts)
                    const documents = drafts.map((draft, index) => ({
                        ...draft,
                        id: `doc-${index + 1}`,
                        status: 'waiting'
                    }))
                    return {
                        documents,
                        processableIds: documents.map((doc) => doc.id),
                        skippedIds: [],
                        updatedIds: [],
                        createdIds: documents.map((doc) => doc.id)
                    }
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
            } as any,
            commandBus as any
        )
        const archiveBuffer = await createZipBuffer({
            '25C13087华升合同.xlsx': 'sheet-content'
        })

        await handler.execute(
            new ImportKnowledgebaseArchiveCommand({
                knowledgebaseId: 'kb-1',
                file: {
                    buffer: archiveBuffer,
                    originalname: '25C13087åè¥åååå.zip',
                    mimetype: 'application/zip',
                    size: archiveBuffer.length
                },
                path: 'contract-reference-packages/25C13087',
                packageCode: '25C13087'
            })
        )

        expect(createdDrafts).toHaveLength(1)
        expect(createdDrafts[0].filePath).toBe(
            'files/contract-reference-packages/25C13087/25C13087合肥华升合同/25C13087华升合同.xlsx'
        )
        expect(createdDrafts[0].filePath).not.toContain('å')
        await expect(
            readFile(
                path.join(
                    tempRoot,
                    'files/contract-reference-packages/25C13087/25C13087合肥华升合同/25C13087华升合同.xlsx'
                ),
                'utf8'
            )
        ).resolves.toBe('sheet-content')
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

function createUploadCommandBus(tempRoot: string) {
    return {
        execute: jest.fn(async (command: any) => {
            const input = command.input
            const source = input.source
            const target = input.targets[0]
            const filePath = path.posix.join(target.folder || '', target.fileName || source.originalName)
            const absolutePath = path.join(tempRoot, filePath)
            await mkdir(path.dirname(absolutePath), { recursive: true })
            await writeFile(absolutePath, source.buffer)
            const fileUrl = `https://files.example/${filePath}`

            return {
                name: source.originalName,
                originalName: source.originalName,
                mimeType: source.mimeType,
                size: source.size ?? source.buffer?.length,
                status: 'success',
                source: {
                    kind: source.kind,
                    name: source.originalName,
                    originalName: source.originalName,
                    mimeType: source.mimeType,
                    size: source.size ?? source.buffer?.length
                },
                destinations: [
                    {
                        kind: 'volume',
                        status: 'success',
                        path: filePath,
                        url: fileUrl,
                        metadata: {
                            catalog: target.catalog,
                            filePath,
                            fileUrl,
                            absolutePath,
                            mimeType: source.mimeType
                        }
                    }
                ]
            }
        })
    }
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

function createStoredZipBuffer(entries: Array<{ rawPath: Buffer; content: Buffer }>) {
    const localParts: Buffer[] = []
    const centralParts: Buffer[] = []
    let offset = 0

    for (const entry of entries) {
        const crc = crc32(entry.content) >>> 0
        const localHeader = Buffer.alloc(30)
        localHeader.writeUInt32LE(0x04034b50, 0)
        localHeader.writeUInt16LE(20, 4)
        localHeader.writeUInt16LE(0, 6)
        localHeader.writeUInt16LE(0, 8)
        localHeader.writeUInt32LE(crc, 14)
        localHeader.writeUInt32LE(entry.content.length, 18)
        localHeader.writeUInt32LE(entry.content.length, 22)
        localHeader.writeUInt16LE(entry.rawPath.length, 26)

        const centralHeader = Buffer.alloc(46)
        centralHeader.writeUInt32LE(0x02014b50, 0)
        centralHeader.writeUInt16LE(20, 4)
        centralHeader.writeUInt16LE(20, 6)
        centralHeader.writeUInt16LE(0, 8)
        centralHeader.writeUInt16LE(0, 10)
        centralHeader.writeUInt32LE(crc, 16)
        centralHeader.writeUInt32LE(entry.content.length, 20)
        centralHeader.writeUInt32LE(entry.content.length, 24)
        centralHeader.writeUInt16LE(entry.rawPath.length, 28)
        centralHeader.writeUInt32LE(offset, 42)

        localParts.push(localHeader, entry.rawPath, entry.content)
        centralParts.push(centralHeader, entry.rawPath)
        offset += localHeader.length + entry.rawPath.length + entry.content.length
    }

    const centralDirectory = Buffer.concat(centralParts)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(centralDirectory.length, 12)
    end.writeUInt32LE(offset, 16)

    return Buffer.concat([...localParts, centralDirectory, end])
}
