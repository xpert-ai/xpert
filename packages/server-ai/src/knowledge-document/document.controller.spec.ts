import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { finished } from 'node:stream/promises'
import { KBDocumentCategoryEnum } from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { KnowledgeDocLoadCommand } from './commands'
import { RagWebLoadCommand } from '../rag-web/commands'
import { KnowledgeDocumentController } from './document.controller'
import { TransformSnapshotUnavailableError } from './transform-snapshot.service'

class TestResponse extends PassThrough {
    statusCode = 200
    readonly headers = new Map<string, string>()

    setHeader(name: string, value: string | number) {
        this.headers.set(name.toLowerCase(), String(value))
        return this
    }

    status(code: number) {
        this.statusCode = code
        return this
    }
}

describe('KnowledgeDocumentController original file preview', () => {
    let rootPath: string
    let filePath: string
    let controller: KnowledgeDocumentController

    beforeEach(async () => {
        rootPath = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-original-preview-'))
        filePath = path.join(rootPath, 'manual.pdf')
        await fsPromises.writeFile(filePath, Buffer.from('0123456789'))
        controller = new KnowledgeDocumentController(
            {
                assertDocumentReadAccess: jest.fn(),
                getOriginalFilePreviewTarget: jest.fn(async () => ({
                    absolutePath: filePath,
                    fileName: 'manual.pdf',
                    mimeType: 'application/pdf'
                }))
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        )
    })

    afterEach(async () => {
        await fsPromises.rm(rootPath, { recursive: true, force: true })
    })

    it('streams the complete PDF with 200 and Range capability headers', async () => {
        const response = new TestResponse()
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

        await controller.previewOriginalFile('doc-1', { headers: {} } as never, response as never)
        await finished(response)

        expect(response.statusCode).toBe(200)
        expect(response.headers.get('accept-ranges')).toBe('bytes')
        expect(response.headers.get('content-length')).toBe('10')
        expect(Buffer.concat(chunks).toString()).toBe('0123456789')
    })

    it('serves a bounded byte range with 206', async () => {
        const response = new TestResponse()
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

        await controller.previewOriginalFile('doc-1', { headers: { range: 'bytes=2-5' } } as never, response as never)
        await finished(response)

        expect(response.statusCode).toBe(206)
        expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
        expect(response.headers.get('content-length')).toBe('4')
        expect(Buffer.concat(chunks).toString()).toBe('2345')
    })

    it('returns 416 for an unsatisfiable range', async () => {
        const response = new TestResponse()

        await controller.headOriginalFile('doc-1', { headers: { range: 'bytes=10-' } } as never, response as never)

        expect(response.statusCode).toBe(416)
        expect(response.headers.get('content-range')).toBe('bytes */10')
    })

    it('supports HEAD without reading the PDF body', async () => {
        const response = new TestResponse()
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

        await controller.headOriginalFile('doc-1', { headers: {} } as never, response as never)

        expect(response.statusCode).toBe(200)
        expect(response.headers.get('content-length')).toBe('10')
        expect(chunks).toHaveLength(0)
    })
})

describe('KnowledgeDocumentController chunk estimate', () => {
    const persistedDocument = {
        id: 'doc-1',
        knowledgebaseId: 'kb-1',
        name: 'manual.pdf',
        type: 'pdf',
        category: KBDocumentCategoryEnum.Text,
        filePath: 'manual.pdf',
        parserConfig: {
            transformerType: 'baidu-paddleocr-vl',
            textSplitterType: 'recursive-character',
            chunkSize: 1000
        },
        metadata: {
            transformSnapshot: {
                transformFingerprint: 'fingerprint'
            }
        }
    }

    function createController(execute: jest.Mock) {
        const service = {
            assertDocumentReadAccess: jest.fn(),
            assertKnowledgebaseReadAccess: jest.fn(),
            assertOwnedStorageFiles: jest.fn(),
            prepareExternalDocumentInputs: jest.fn(),
            findOne: jest.fn(async () => persistedDocument)
        }
        const controller = new KnowledgeDocumentController(
            service as never,
            {} as never,
            {} as never,
            {} as never,
            { execute } as never,
            {} as never,
            {} as never
        )
        return { controller, service }
    }

    function executedCommand(execute: jest.Mock, index = 0) {
        return execute.mock.calls[index][0] as KnowledgeDocLoadCommand
    }

    it('reuses the persisted transform snapshot and applies draft splitter settings', async () => {
        const execute = jest.fn(async () => ({ chunks: [] }))
        const { controller, service } = createController(execute)
        const parserConfig = {
            ...persistedDocument.parserConfig,
            chunkSize: 500,
            chunkOverlap: 50
        }

        await controller.estimate({ id: 'doc-1', parserConfig })

        expect(service.findOne).toHaveBeenCalledWith('doc-1')
        expect(execute).toHaveBeenCalledTimes(1)
        const command = executedCommand(execute)
        expect(command.input).toMatchObject({
            stage: 'test',
            mode: 'rechunk',
            doc: {
                id: 'doc-1',
                filePath: 'manual.pdf',
                parserConfig
            }
        })
    })

    it.each(['missing', 'stale', 'corrupt'] as const)(
        'falls back to one full conversion when the transform snapshot is %s',
        async (reason) => {
            const execute = jest
                .fn()
                .mockRejectedValueOnce(new TransformSnapshotUnavailableError(reason))
                .mockResolvedValueOnce({ chunks: [] })
            const { controller } = createController(execute)

            await controller.estimate({ id: 'doc-1', parserConfig: persistedDocument.parserConfig })

            expect(execute).toHaveBeenCalledTimes(2)
            expect(executedCommand(execute, 0).input.mode).toBe('rechunk')
            expect(executedCommand(execute, 1).input.mode).toBe('full')
        }
    )

    it('does not retry conversion for an unrelated preview failure', async () => {
        const execute = jest.fn().mockRejectedValueOnce(new Error('Splitter failed'))
        const { controller } = createController(execute)

        await expect(
            controller.estimate({ id: 'doc-1', parserConfig: persistedDocument.parserConfig })
        ).rejects.toThrow('Splitter failed')
        expect(execute).toHaveBeenCalledTimes(1)
    })

    it('uses full conversion for a document that has not been saved yet', async () => {
        const execute = jest.fn(async () => ({ chunks: [] }))
        const { controller, service } = createController(execute)

        await controller.estimate({
            knowledgebaseId: 'kb-1',
            name: 'new.pdf',
            type: 'pdf',
            filePath: 'new.pdf',
            parserConfig: persistedDocument.parserConfig
        })

        expect(service.findOne).not.toHaveBeenCalled()
        expect(service.assertKnowledgebaseReadAccess).toHaveBeenCalledWith('kb-1')
        expect(service.assertOwnedStorageFiles).not.toHaveBeenCalled()
        expect(executedCommand(execute).input.mode).toBe('full')
    })

    it('authorizes a draft storage file before loading it', async () => {
        const execute = jest.fn(async () => ({ chunks: [] }))
        const { controller, service } = createController(execute)

        await controller.estimate({
            knowledgebaseId: 'kb-1',
            storageFileId: 'storage-1',
            name: 'new.pdf',
            type: 'pdf',
            parserConfig: persistedDocument.parserConfig
        })

        expect(service.assertOwnedStorageFiles).toHaveBeenCalledWith(['storage-1'])
        expect(execute).toHaveBeenCalledTimes(1)
    })

    it('stops an untrusted draft remote URL before preview loading', async () => {
        const execute = jest.fn()
        const { controller, service } = createController(execute)
        service.prepareExternalDocumentInputs.mockRejectedValue(new BadRequestException())

        await expect(
            controller.estimate({
                knowledgebaseId: 'kb-1',
                fileUrl: 'http://127.0.0.1/internal',
                name: 'remote.pdf',
                type: 'pdf',
                parserConfig: persistedDocument.parserConfig
            })
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(execute).not.toHaveBeenCalled()
    })
})

describe('KnowledgeDocumentController parent knowledgebase access', () => {
    function createController() {
        const service = {
            assertKnowledgebaseReadAccess: jest.fn(),
            findAll: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const controller = new KnowledgeDocumentController(
            service as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        )
        return { controller, service }
    }

    it('checks the parent knowledgebase before listing documents', async () => {
        const { controller, service } = createController()

        await controller.findAll({
            where: { knowledgebaseId: 'kb-owner' },
            relations: ['parent'],
            take: 20,
            skip: 0,
            order: {},
            withDeleted: false
        })

        expect(service.assertKnowledgebaseReadAccess).toHaveBeenCalledWith('kb-owner')
        expect(service.findAll).toHaveBeenCalledWith(expect.objectContaining({ relations: ['parent'] }))
    })

    it.each([
        [[{ knowledgebaseId: 'kb-owner' }, { name: 'victim.pdf' }]],
        [[{ knowledgebaseId: 'kb-owner' }, { knowledgebaseId: 'kb-victim' }]]
    ])('rejects a list filter with an unscoped or mixed knowledgebase branch', async (where) => {
        const { controller, service } = createController()

        await expect(
            controller.findAll({
                where: where as never,
                take: 20,
                skip: 0,
                order: {},
                withDeleted: false
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.assertKnowledgebaseReadAccess).not.toHaveBeenCalled()
        expect(service.findAll).not.toHaveBeenCalled()
    })

    it('rejects sensitive client-selected relations', async () => {
        const { controller, service } = createController()

        await expect(
            controller.findAll({
                where: { knowledgebaseId: 'kb-owner' },
                relations: ['knowledgebase.integration'] as never,
                take: 20,
                skip: 0,
                order: {},
                withDeleted: false
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.findAll).not.toHaveBeenCalled()
    })
})

describe('KnowledgeDocumentController create storage access', () => {
    function createController() {
        const service = {
            assertKnowledgebaseWriteAccess: jest.fn(),
            assertDocumentWriteAccess: jest.fn(),
            assertOwnedStorageFiles: jest.fn(),
            prepareExternalDocumentInputs: jest.fn(),
            create: jest.fn(async (entity: object) => entity),
            updateWithVersion: jest.fn(async (_id: string, entity: object) => entity),
            createBulkWithIncrementalSync: jest.fn(async (entities: object[]) => ({
                documents: entities,
                processableIds: []
            }))
        }
        const controller = new KnowledgeDocumentController(
            service as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        )
        return { controller, service }
    }

    it('authorizes the StorageFile before creating a document', async () => {
        const { controller, service } = createController()

        await controller.create({ knowledgebaseId: 'kb-owner', storageFileId: 'storage-owner' })

        expect(service.assertOwnedStorageFiles).toHaveBeenCalledWith(['storage-owner'])
        expect(service.prepareExternalDocumentInputs).toHaveBeenCalled()
        expect(service.create).toHaveBeenCalled()
    })

    it('authorizes every StorageFile before bulk creation', async () => {
        const { controller, service } = createController()

        await controller.createBulk(
            [
                { knowledgebaseId: 'kb-owner', storageFileId: 'storage-1' },
                { knowledgebaseId: 'kb-owner', storageFileId: 'storage-2' }
            ],
            false
        )

        expect(service.assertOwnedStorageFiles).toHaveBeenCalledWith(['storage-1', 'storage-2'])
        expect(service.prepareExternalDocumentInputs).toHaveBeenCalled()
        expect(service.createBulkWithIncrementalSync).toHaveBeenCalled()
    })

    it('passes the route document id into managed filePath authorization on update', async () => {
        const { controller, service } = createController()
        const entity = { version: 1, filePath: 'files/reports/summary.pdf' }

        await controller.update('doc-owner', entity)

        expect(service.prepareExternalDocumentInputs).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'doc-owner', filePath: 'files/reports/summary.pdf' })],
            { resolveDocumentIds: true }
        )
        expect(service.updateWithVersion).toHaveBeenCalledWith('doc-owner', expect.any(Object), 1)
    })
})

describe('KnowledgeDocumentController web integration access', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    function createController(integration: object | null) {
        const integrationService = {
            findOneInOrganizationOrTenant: jest.fn().mockResolvedValue(integration)
        }
        const commandBus = {
            execute: jest.fn().mockResolvedValue({ docs: [] })
        }
        const controller = new KnowledgeDocumentController(
            {} as never,
            {} as never,
            {} as never,
            integrationService as never,
            commandBus as never,
            {} as never,
            {} as never
        )
        return { controller, integrationService, commandBus }
    }

    it('replaces the client integration object with the canonical authorized record', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const canonical = {
            id: 'integration-1',
            createdById: 'owner-user',
            organizationId: null,
            options: { token: 'canonical-secret' }
        }
        const { controller, commandBus } = createController(canonical)

        await controller.loadRagWeb('browser', {
            webOptions: { url: 'https://example.com' } as never,
            integration: { id: 'integration-1', options: { token: 'client-secret' } } as never
        })

        const command = commandBus.execute.mock.calls[0][0] as RagWebLoadCommand
        expect(command.input.integration).toBe(canonical)
    })

    it('rejects an unscoped integration owned by another user', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('ordinary-user')
        const { controller, commandBus } = createController({
            id: 'integration-victim',
            createdById: 'victim-user',
            organizationId: null
        })

        await expect(
            controller.loadRagWeb('browser', {
                webOptions: { url: 'https://example.com' } as never,
                integration: { id: 'integration-victim' }
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(commandBus.execute).not.toHaveBeenCalled()
    })
})
