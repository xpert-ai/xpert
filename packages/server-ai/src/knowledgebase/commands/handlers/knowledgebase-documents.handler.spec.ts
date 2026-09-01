import archiver from 'archiver'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { crc32 } from 'node:zlib'
import {
    CreateKnowledgebaseDocumentsCommand,
    CreateKnowledgebaseFolderCommand,
    DeleteKnowledgebaseDocumentsCommand,
    GetKnowledgebaseDocumentStatusCommand,
    ImportKnowledgebaseArchiveCommand,
    ListKnowledgebaseDocumentsCommand,
    MoveKnowledgebaseDocumentCommand,
    StartKnowledgebaseDocumentsProcessingCommand,
    UploadKnowledgebaseDocumentFileCommand
} from '../knowledgebase-documents.command'
import {
    CreateKnowledgebaseDocumentsHandler,
    CreateKnowledgebaseFolderHandler,
    DeleteKnowledgebaseDocumentsHandler,
    GetKnowledgebaseDocumentStatusHandler,
    ImportKnowledgebaseArchiveHandler,
    ListKnowledgebaseDocumentsHandler,
    MoveKnowledgebaseDocumentHandler,
    StartKnowledgebaseDocumentsProcessingHandler,
    UploadKnowledgebaseDocumentFileHandler
} from './knowledgebase-documents.handler'
import { DocumentTypeEnum } from '@xpert-ai/contracts'
import { VolumeSubtreeClient } from '../../../shared'

describe('ListKnowledgebaseDocumentsHandler', () => {
    it('returns a bounded document catalog without exposing folders by default', async () => {
        const knowledgebaseService = { findOneByIdString: jest.fn(async () => ({ id: 'kb-1' })) }
        const documentService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'doc-1',
                        name: 'agreement.pdf',
                        type: 'pdf',
                        knowledgebaseId: 'kb-1',
                        status: 'finish',
                        progress: 100,
                        tokenNum: 1200,
                        chunkNum: 18,
                        sourceHash: 'source-hash',
                        contentHash: 'content-hash',
                        disabled: false,
                        createdAt: new Date('2026-08-01T00:00:00.000Z'),
                        updatedAt: new Date('2026-08-02T00:00:00.000Z'),
                        metadata: {}
                    }
                ],
                total: 1
            }))
        }
        const handler = new ListKnowledgebaseDocumentsHandler(knowledgebaseService as any, documentService as any)

        const result = await handler.execute(
            new ListKnowledgebaseDocumentsCommand({
                knowledgebaseId: 'kb-1',
                page: 2,
                pageSize: 10,
                search: 'agreement'
            })
        )

        expect(knowledgebaseService.findOneByIdString).toHaveBeenCalledWith('kb-1', { select: { id: true } })
        expect(documentService.findAll).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }))
        expect(result).toEqual(
            expect.objectContaining({
                total: 1,
                page: 2,
                pageSize: 10,
                documents: [
                    expect.objectContaining({
                        id: 'doc-1',
                        chunkNum: 18,
                        tokenNum: 1200,
                        sourceHash: 'source-hash',
                        contentHash: 'content-hash',
                        updatedAt: '2026-08-02T00:00:00.000Z'
                    })
                ]
            })
        )
    })

    it('applies a Case folder descendant boundary before returning documents', async () => {
        const folder = {
            id: 'folder-case',
            name: '26B31301',
            knowledgebaseId: 'kb-1',
            sourceType: DocumentTypeEnum.FOLDER
        }
        const knowledgebaseService = { findOneByIdString: jest.fn(async () => ({ id: 'kb-1' })) }
        const documentService = {
            findOne: jest.fn(async () => folder),
            findAll: jest.fn(async () => ({ items: [], total: 0 }))
        }
        const handler = new ListKnowledgebaseDocumentsHandler(knowledgebaseService as any, documentService as any)

        await handler.execute(
            new ListKnowledgebaseDocumentsCommand({
                knowledgebaseId: 'kb-1',
                parentId: 'folder-case',
                folderPath: 'customers/JNGL/cases/26B31301',
                folderMode: 'descendants'
            })
        )

        expect(documentService.findOne).toHaveBeenCalledWith('folder-case', { relations: ['parent'] })
        expect(documentService.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ knowledgebaseId: 'kb-1', parent: { id: 'folder-case' } })
            })
        )
    })
})

describe('CreateKnowledgebaseFolderHandler', () => {
    it('creates one idempotent folder under the selected parent', async () => {
        const parent = {
            id: 'folder-cases',
            name: 'cases',
            knowledgebaseId: 'kb-1',
            sourceType: DocumentTypeEnum.FOLDER
        }
        const created = {
            id: 'folder-case',
            name: '26B31301',
            folder: 'customers/JNGL/cases',
            knowledgebaseId: 'kb-1',
            sourceType: DocumentTypeEnum.FOLDER
        }
        const documentService = {
            findOne: jest.fn(async () => parent),
            findAll: jest.fn(async () => ({ items: [], total: 0 })),
            createDocument: jest.fn(async () => created)
        }
        const knowledgebaseService = {
            assertKnowledgebaseWriteAccess: jest.fn(async () => ({ id: 'kb-1' })),
            assertNotRebuilding: jest.fn()
        }
        const handler = new CreateKnowledgebaseFolderHandler(knowledgebaseService as any, documentService as any)

        const result = await handler.execute(
            new CreateKnowledgebaseFolderCommand({
                knowledgebaseId: 'kb-1',
                parentId: 'folder-cases',
                name: '26B31301'
            })
        )

        expect(documentService.createDocument).toHaveBeenCalledWith(
            expect.objectContaining({
                knowledgebaseId: 'kb-1',
                parent: { id: 'folder-cases' },
                name: '26B31301'
            })
        )
        expect(knowledgebaseService.assertKnowledgebaseWriteAccess).toHaveBeenCalledWith('kb-1', {
            select: { id: true }
        })
        expect(result.folder).toMatchObject({ id: 'folder-case', folderPath: 'customers/JNGL/cases' })
    })
})

describe('MoveKnowledgebaseDocumentHandler', () => {
    it('delegates the governed move and returns affected descendants', async () => {
        const documentService = {
            assertDocumentsWriteAccessInKnowledgebase: jest.fn(),
            moveDocument: jest.fn(async () => ({
                document: {
                    id: 'doc-1',
                    name: 'agreement.pdf',
                    folder: 'customers/JNGL/cases/26B31301/02-技术协议',
                    knowledgebaseId: 'kb-1'
                },
                affectedDocumentIds: ['doc-1']
            }))
        }
        const handler = new MoveKnowledgebaseDocumentHandler(documentService as any)
        const result = await handler.execute(
            new MoveKnowledgebaseDocumentCommand({
                knowledgebaseId: 'kb-1',
                documentId: 'doc-1',
                parentId: 'folder-agreement',
                expectedVersion: 3
            })
        )
        expect(documentService.moveDocument).toHaveBeenCalledWith({
            knowledgebaseId: 'kb-1',
            documentId: 'doc-1',
            parentId: 'folder-agreement',
            expectedVersion: 3
        })
        expect(documentService.assertDocumentsWriteAccessInKnowledgebase).toHaveBeenCalledWith(['doc-1'], 'kb-1')
        expect(result.affectedDocumentIds).toEqual(['doc-1'])
    })
})

describe('UploadKnowledgebaseDocumentFileHandler', () => {
    it('stores nested uploads using the root-to-child logical folder order', async () => {
        const knowledgebaseService = {
            assertKnowledgebaseWriteAccess: jest.fn(async () => ({ id: 'kb-1' })),
            assertNotRebuilding: jest.fn(),
            resolveKnowledgebaseFolderAncestors: jest.fn(async () => [
                { id: 'folder-water', name: '水利', sourceType: DocumentTypeEnum.FOLDER },
                { id: 'folder-east', name: '华东', sourceType: DocumentTypeEnum.FOLDER }
            ])
        }
        const documentService = {
            findAncestors: jest.fn()
        }
        const knowledgeWorkAreaResolver = {
            getFilesPath: jest.fn((folder: string) => path.posix.join('files', folder || ''))
        }
        const commandBus = {
            execute: jest.fn(async (command: any) => {
                const target = command.input.targets[0]
                const filePath = path.posix.join(target.folder, target.fileName)
                return {
                    status: 'success',
                    destinations: [{ kind: 'volume', status: 'success', path: filePath, url: `file://${filePath}` }]
                }
            })
        }
        const handler = new UploadKnowledgebaseDocumentFileHandler(
            knowledgebaseService as any,
            documentService as any,
            knowledgeWorkAreaResolver as any,
            commandBus as any
        )

        const result = await handler.execute(
            new UploadKnowledgebaseDocumentFileCommand({
                knowledgebaseId: 'kb-1',
                parentId: 'folder-east',
                file: {
                    originalname: 'pricing.pdf',
                    mimetype: 'application/pdf',
                    size: 3,
                    buffer: Buffer.from('pdf')
                }
            } as any)
        )

        expect(knowledgebaseService.resolveKnowledgebaseFolderAncestors).toHaveBeenCalledWith('kb-1', 'folder-east')
        expect(knowledgebaseService.assertKnowledgebaseWriteAccess).toHaveBeenCalledWith('kb-1', {
            select: { id: true }
        })
        expect(knowledgeWorkAreaResolver.getFilesPath).toHaveBeenCalledWith('水利/华东')
        expect(result.filePath).toMatch(/^files\/水利\/华东\/pricing-/)
    })
})

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
            assertKnowledgebaseWriteAccess: jest.fn(async () => ({ id: 'kb-1' })),
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
                assertKnowledgebaseWriteAccess: jest.fn(async () => ({ id: 'kb-1' })),
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
                assertKnowledgebaseWriteAccess: jest.fn(async () => ({ id: 'kb-1' })),
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
                assertKnowledgebaseWriteAccess: jest.fn(async () => ({ id: 'kb-1' })),
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
            assertDocumentsWriteAccessInKnowledgebase: jest.fn(),
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
        expect(documentService.assertDocumentsWriteAccessInKnowledgebase).toHaveBeenCalledWith(
            ['doc-1', 'doc-missing'],
            'kb-1'
        )
        expect(result).toEqual({
            knowledgebaseId: 'kb-1',
            documentIds: ['doc-1'],
            deletedDocumentCount: 1,
            missingDocumentIds: ['doc-missing']
        })
    })
})

describe('Knowledgebase document command access boundaries', () => {
    it('stops a document list before querying documents when the knowledgebase read check fails', async () => {
        const accessError = new Error('denied')
        const knowledgebaseService = {
            findOneByIdString: jest.fn(async () => {
                throw accessError
            })
        }
        const documentService = { findAll: jest.fn() }
        const handler = new ListKnowledgebaseDocumentsHandler(knowledgebaseService as any, documentService as any)

        await expect(
            handler.execute(new ListKnowledgebaseDocumentsCommand({ knowledgebaseId: 'victim-kb' }))
        ).rejects.toBe(accessError)
        expect(documentService.findAll).not.toHaveBeenCalled()
    })

    it('stops document creation before rebuild checks or persistence when the knowledgebase write check fails', async () => {
        const accessError = new Error('denied')
        const knowledgebaseService = {
            assertKnowledgebaseWriteAccess: jest.fn(async () => {
                throw accessError
            }),
            assertNotRebuilding: jest.fn()
        }
        const documentService = { createBulkWithIncrementalSync: jest.fn() }
        const handler = new CreateKnowledgebaseDocumentsHandler(
            knowledgebaseService as any,
            documentService as any,
            { getFilesPath: jest.fn(), resolve: jest.fn() } as any
        )

        await expect(
            handler.execute(
                new CreateKnowledgebaseDocumentsCommand({
                    knowledgebaseId: 'victim-kb',
                    documents: [{ name: 'victim.pdf', filePath: 'files/victim.pdf' }]
                })
            )
        ).rejects.toBe(accessError)
        expect(knowledgebaseService.assertNotRebuilding).not.toHaveBeenCalled()
        expect(documentService.createBulkWithIncrementalSync).not.toHaveBeenCalled()
    })

    it('canonicalizes a managed runtime file and drops untrusted document fields before persistence', async () => {
        const readFile = jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'reference/manual.pdf',
            fileUrl: 'https://files.example.test/reference/manual.pdf',
            mimeType: 'application/pdf',
            size: 128
        })
        const knowledgebaseService = {
            assertKnowledgebaseWriteAccess: jest.fn(async () => ({ id: 'kb-owner', tenantId: 'tenant-1' })),
            assertNotRebuilding: jest.fn(),
            resolveKnowledgebaseFolderAncestors: jest.fn()
        }
        const documentService = {
            createBulkWithIncrementalSync: jest.fn(async (drafts) => ({
                documents: drafts.map((draft, index) => ({ ...draft, id: `doc-${index + 1}` })),
                processableIds: [],
                skippedIds: [],
                updatedIds: [],
                createdIds: ['doc-1']
            }))
        }
        const knowledgeWorkAreaResolver = {
            getFilesPath: jest.fn(() => 'files'),
            resolve: jest.fn(async () => ({ volume: {} }))
        }
        const handler = new CreateKnowledgebaseDocumentsHandler(
            knowledgebaseService as any,
            documentService as any,
            knowledgeWorkAreaResolver as any
        )

        await handler.execute(
            new CreateKnowledgebaseDocumentsCommand({
                knowledgebaseId: 'kb-owner',
                documents: [
                    {
                        id: 'victim-doc',
                        name: 'manual.pdf',
                        filePath: 'files/reference/manual.pdf',
                        fileUrl: 'http://127.0.0.1/internal',
                        tenantId: 'victim-tenant'
                    } as never
                ]
            })
        )

        const persisted = documentService.createBulkWithIncrementalSync.mock.calls[0][0][0]
        expect(readFile).toHaveBeenCalledWith('files', 'reference/manual.pdf', { metadataOnly: true })
        expect(persisted).toEqual(
            expect.objectContaining({
                knowledgebaseId: 'kb-owner',
                filePath: 'files/reference/manual.pdf',
                fileUrl: 'https://files.example.test/reference/manual.pdf',
                mimeType: 'application/pdf',
                size: '128'
            })
        )
        expect(persisted).not.toHaveProperty('id')
        expect(persisted).not.toHaveProperty('tenantId')
        readFile.mockRestore()
    })

    it.each([
        ['a remote URL without a managed path', { fileUrl: 'http://127.0.0.1/internal' }],
        ['a traversal path', { filePath: 'files/../../etc/passwd' }]
    ])('rejects runtime document creation using %s', async (_label, document) => {
        const knowledgebaseService = {
            assertKnowledgebaseWriteAccess: jest.fn(async () => ({ id: 'kb-owner', tenantId: 'tenant-1' })),
            assertNotRebuilding: jest.fn(),
            resolveKnowledgebaseFolderAncestors: jest.fn()
        }
        const documentService = { createBulkWithIncrementalSync: jest.fn() }
        const handler = new CreateKnowledgebaseDocumentsHandler(
            knowledgebaseService as any,
            documentService as any,
            {
                getFilesPath: jest.fn(() => 'files'),
                resolve: jest.fn(async () => ({ volume: {} }))
            } as any
        )

        await expect(
            handler.execute(
                new CreateKnowledgebaseDocumentsCommand({
                    knowledgebaseId: 'kb-owner',
                    documents: [{ name: 'victim.pdf', ...document }]
                })
            )
        ).rejects.toBeInstanceOf(Error)
        expect(documentService.createBulkWithIncrementalSync).not.toHaveBeenCalled()
    })

    it('uses route-scoped write access before starting processing', async () => {
        const accessError = new Error('denied')
        const documentService = {
            assertDocumentsWriteAccessInKnowledgebase: jest.fn(async () => {
                throw accessError
            }),
            startProcessing: jest.fn()
        }
        const handler = new StartKnowledgebaseDocumentsProcessingHandler(documentService as any)

        await expect(
            handler.execute(
                new StartKnowledgebaseDocumentsProcessingCommand({
                    knowledgebaseId: 'victim-kb',
                    documentIds: ['victim-doc']
                })
            )
        ).rejects.toBe(accessError)
        expect(documentService.startProcessing).not.toHaveBeenCalled()
    })

    it('uses route-scoped read access before loading document status', async () => {
        const accessError = new Error('denied')
        const documentService = {
            assertDocumentsReadAccessInKnowledgebase: jest.fn(async () => {
                throw accessError
            }),
            findAll: jest.fn()
        }
        const handler = new GetKnowledgebaseDocumentStatusHandler(documentService as any)

        await expect(
            handler.execute(
                new GetKnowledgebaseDocumentStatusCommand({
                    knowledgebaseId: 'victim-kb',
                    documentIds: ['victim-doc']
                })
            )
        ).rejects.toBe(accessError)
        expect(documentService.findAll).not.toHaveBeenCalled()
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
