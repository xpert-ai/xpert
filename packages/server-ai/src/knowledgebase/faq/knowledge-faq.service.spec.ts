import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants'
import { getDataSourceToken } from '@nestjs/typeorm'
import type { DataSource } from 'typeorm'
import type { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import type { KnowledgeDocumentService } from '../../knowledge-document/document.service'
import type { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeFAQService } from './knowledge-faq.service'
import { createFAQLogicalVectorId } from './faq-projection'

type TestFAQChunk = {
    id: string
    knowledgebaseId?: string
    documentId?: string
    version?: number
    pageContent?: string
    metadata?: unknown
    createdAt?: Date
    updatedAt?: Date
}

function createFixture(options?: {
    existingChunks?: TestFAQChunk[]
    addVectorsError?: Error
    addVectorsErrors?: Array<Error | undefined>
    deleteVectorsError?: Error
    embeddingContextSize?: number
    managedDocumentExists?: boolean
    statefulChunks?: boolean
    updateError?: Error
    updateErrors?: Array<Error | undefined>
}) {
    const knowledgebase = {
        id: 'kb-faq',
        name: 'FAQ knowledgebase',
        type: KnowledgebaseTypeEnum.FAQ,
        faqConfig: {
            indexMode: 'question_answer' as const,
            questionIndexMode: 'separate' as const
        },
        copilotModel: {
            options: { context_size: options?.embeddingContextSize ?? 8192 }
        }
    }
    let addVectorsCall = 0
    const vectorStore = {
        addKnowledgeChunks: jest.fn().mockImplementation(async () => {
            const error = options?.addVectorsErrors?.[addVectorsCall++] ?? options?.addVectorsError
            if (error) throw error
        }),
        deleteChunks: options?.deleteVectorsError
            ? jest.fn().mockRejectedValue(options.deleteVectorsError)
            : jest.fn().mockResolvedValue(undefined)
    }
    const managedDocument = {
        id: 'faq-document',
        knowledgebaseId: knowledgebase.id,
        name: 'FAQ',
        metadata: { systemManaged: true, systemManagedType: 'faq' }
    }
    const knowledgebaseService = {
        assertKnowledgebaseWriteAccess: jest.fn().mockResolvedValue(knowledgebase),
        findOneByIdString: jest.fn().mockResolvedValue(knowledgebase),
        assertNotRebuilding: jest.fn().mockResolvedValue(undefined),
        getActiveVectorStore: jest.fn().mockResolvedValue(vectorStore)
    }
    const documentService = {
        findAll: jest.fn().mockResolvedValue({
            items: options?.managedDocumentExists === false ? [] : [managedDocument],
            total: options?.managedDocumentExists === false ? 0 : 1
        }),
        createDocument: jest.fn().mockResolvedValue(managedDocument)
    }
    const storedChunks = [...(options?.existingChunks ?? [])]
    let updateCall = 0
    const chunkService = {
        findAll: jest.fn().mockImplementation(async () => ({
            items: options?.statefulChunks ? [...storedChunks] : (options?.existingChunks ?? []),
            total: storedChunks.length
        })),
        findOneByOptions: jest.fn(),
        create: jest.fn().mockImplementation(async (entity: TestFAQChunk) => {
            const created = {
                ...entity,
                version: entity.version ?? 1,
                createdAt: new Date('2026-09-04T00:00:00.000Z'),
                updatedAt: new Date('2026-09-04T00:00:00.000Z')
            }
            if (options?.statefulChunks) storedChunks.push(created)
            return created
        }),
        updateWithVersion: jest
            .fn()
            .mockImplementation(
                async (id: string, changes: Pick<TestFAQChunk, 'pageContent' | 'metadata'>, version: number) => {
                    const error = options?.updateErrors?.[updateCall++] ?? options?.updateError
                    if (error) throw error
                    if (options?.statefulChunks) {
                        const chunk = storedChunks.find((item) => item.id === id)
                        if (chunk?.version !== version) return { affected: 0 }
                        Object.assign(chunk, changes, { version: version + 1 })
                    }
                    return { affected: 1 }
                }
            ),
        deleteWithVersion: jest.fn().mockImplementation(async (id: string, version: number) => {
            if (options?.statefulChunks) {
                const index = storedChunks.findIndex((item) => item.id === id && item.version === version)
                if (index < 0) return { affected: 0 }
                storedChunks.splice(index, 1)
            }
            return { affected: 1 }
        })
    }
    const dataSource = { options: { type: 'sqlite' } }
    const service = new KnowledgeFAQService(
        knowledgebaseService as unknown as KnowledgebaseService,
        documentService as unknown as KnowledgeDocumentService,
        chunkService as unknown as KnowledgeDocumentChunkService,
        dataSource as DataSource
    )

    return {
        service,
        knowledgebase,
        vectorStore,
        managedDocument,
        knowledgebaseService,
        documentService,
        chunkService
    }
}

describe('KnowledgeFAQService', () => {
    const input = {
        standardQuestion: '如何重置密码？',
        similarQuestions: ['忘记密码怎么办？'],
        negativeQuestions: ['如何修改用户名？'],
        answerBlocks: ['打开设置页面。', '点击“重置密码”。'],
        enabled: true
    }

    it('declares the Nest DataSource injection token for runtime bootstrap', () => {
        const dependencies = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, KnowledgeFAQService) ?? []

        expect(dependencies).toContainEqual({ index: 3, param: getDataSourceToken() })
    })

    it('creates one canonical chunk and separate question vectors plus one copy of each answer block', async () => {
        const fixture = createFixture()

        const result = await fixture.service.create(fixture.knowledgebase.id, input)

        expect(result).toEqual(
            expect.objectContaining({
                knowledgebaseId: fixture.knowledgebase.id,
                standardQuestion: input.standardQuestion,
                similarQuestions: input.similarQuestions,
                negativeQuestions: input.negativeQuestions,
                answerBlocks: input.answerBlocks,
                enabled: true,
                version: 2
            })
        )
        expect(fixture.chunkService.create).toHaveBeenCalledTimes(1)
        expect(fixture.vectorStore.addKnowledgeChunks).toHaveBeenCalledTimes(1)
        const [vectorChunks, vectorOptions] = fixture.vectorStore.addKnowledgeChunks.mock.calls[0]
        expect(vectorOptions.ids).toHaveLength(4)
        expect(vectorChunks).toHaveLength(4)
        expect(vectorChunks.map((chunk) => chunk.metadata.chunkId)).toEqual([
            result.id,
            result.id,
            result.id,
            result.id
        ])
        expect(vectorChunks.map((chunk) => chunk.metadata.searchContent)).toEqual([
            '如何重置密码？',
            '忘记密码怎么办？',
            '打开设置页面。',
            '点击“重置密码”。'
        ])
        expect(vectorChunks.filter((chunk) => chunk.metadata.searchContent === '打开设置页面。')).toHaveLength(1)
        expect(fixture.chunkService.updateWithVersion).toHaveBeenCalledWith(
            result.id,
            expect.objectContaining({
                metadata: expect.objectContaining({
                    contentKind: 'faq',
                    enabled: true,
                    negativeQuestions: input.negativeQuestions,
                    vectorSyncStatus: 'ready',
                    faqVectorIds: vectorOptions.ids
                })
            }),
            1
        )
    })

    it('creates the hidden managed FAQ document on first use', async () => {
        const fixture = createFixture({ managedDocumentExists: false })

        await fixture.service.create(fixture.knowledgebase.id, input)

        expect(fixture.documentService.createDocument).toHaveBeenCalledWith(
            expect.objectContaining({
                knowledgebaseId: fixture.knowledgebase.id,
                sourceKey: 'system:faq',
                metadata: {
                    systemManaged: true,
                    systemManagedType: 'faq'
                }
            })
        )
    })

    it('loads configured embedding relations by knowledgebase id before writing vectors', async () => {
        const fixture = createFixture()

        await fixture.service.create(fixture.knowledgebase.id, input)

        expect(fixture.knowledgebaseService.getActiveVectorStore).toHaveBeenCalledWith(fixture.knowledgebase.id, true)
    })

    it('splits FAQ vectors using the configured embedding model context size', async () => {
        const fixture = createFixture({ embeddingContextSize: 8 })

        await fixture.service.create(fixture.knowledgebase.id, input)

        const [vectorChunks] = fixture.vectorStore.addKnowledgeChunks.mock.calls[0]
        expect(vectorChunks.length).toBeGreaterThan(4)
    })

    it('rejects questions already used by disabled FAQ entries before writing vectors', async () => {
        const fixture = createFixture({
            existingChunks: [
                {
                    id: 'existing-faq',
                    metadata: {
                        chunkId: 'existing-faq',
                        contentKind: 'faq',
                        standardQuestion: '其他问题',
                        similarQuestions: ['忘记密码怎么办?'],
                        answerBlocks: ['旧回答'],
                        enabled: false,
                        faqVectorIds: [],
                        vectorSyncStatus: 'ready'
                    }
                }
            ]
        })

        await expect(fixture.service.create(fixture.knowledgebase.id, input)).rejects.toMatchObject({ status: 400 })
        expect(fixture.chunkService.create).not.toHaveBeenCalled()
        expect(fixture.vectorStore.addKnowledgeChunks).not.toHaveBeenCalled()
    })

    it('removes a pending canonical chunk when vector creation fails', async () => {
        const fixture = createFixture({ addVectorsError: new Error('embedding unavailable') })

        await expect(fixture.service.create(fixture.knowledgebase.id, input)).rejects.toThrow('embedding unavailable')

        const pendingChunk = fixture.chunkService.create.mock.results[0].value
        await expect(pendingChunk).resolves.toEqual(expect.objectContaining({ version: 1 }))
        expect(fixture.chunkService.deleteWithVersion).toHaveBeenCalledWith(expect.any(String), 1)
        expect(fixture.vectorStore.deleteChunks).toHaveBeenCalledWith(expect.any(Array))
        expect(fixture.chunkService.updateWithVersion).not.toHaveBeenCalled()
    })

    it('reports a distinct recovery failure when failed-create cleanup is incomplete', async () => {
        const fixture = createFixture({
            addVectorsError: new Error('embedding unavailable'),
            deleteVectorsError: new Error('vector cleanup unavailable')
        })

        await expect(fixture.service.create(fixture.knowledgebase.id, input)).rejects.toMatchObject({
            response: expect.objectContaining({ code: 'knowledge_faq_recovery_failed' })
        })
    })

    it('lists only ready FAQ chunks and applies search, enabled, and pagination filters', async () => {
        const fixture = createFixture({
            existingChunks: [
                {
                    id: 'faq-1',
                    knowledgebaseId: 'kb-faq',
                    version: 3,
                    updatedAt: new Date('2026-09-04T02:00:00.000Z'),
                    metadata: {
                        chunkId: 'faq-1',
                        contentKind: 'faq',
                        standardQuestion: '如何重置密码？',
                        similarQuestions: [],
                        answerBlocks: ['回答一'],
                        enabled: true,
                        faqVectorIds: ['faq-1::faq-vector:question:0'],
                        vectorSyncStatus: 'ready'
                    }
                },
                {
                    id: 'faq-pending',
                    metadata: {
                        chunkId: 'faq-pending',
                        contentKind: 'faq',
                        standardQuestion: '不应显示',
                        similarQuestions: [],
                        answerBlocks: ['回答'],
                        enabled: false,
                        faqVectorIds: [],
                        vectorSyncStatus: 'pending'
                    }
                }
            ]
        })

        await expect(
            fixture.service.findAll(fixture.knowledgebase.id, { search: '重置', enabled: true, skip: 0, take: 10 })
        ).resolves.toEqual({
            items: [
                expect.objectContaining({
                    id: 'faq-1',
                    standardQuestion: '如何重置密码？',
                    enabled: true,
                    version: 3
                })
            ],
            total: 1
        })
    })

    it('updates every vector projection and advances the canonical chunk version', async () => {
        const fixture = createFixture({
            existingChunks: [createExistingFAQChunk()]
        })

        const result = await fixture.service.update(fixture.knowledgebase.id, 'faq-existing', {
            ...input,
            similarQuestions: ['忘记密码怎么办？', '密码找不回来了'],
            version: 3
        })

        expect(result).toEqual(expect.objectContaining({ id: 'faq-existing', version: 4 }))
        expect(fixture.vectorStore.addKnowledgeChunks).toHaveBeenCalledTimes(1)
        expect(fixture.chunkService.updateWithVersion).toHaveBeenCalledWith(
            'faq-existing',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    similarQuestions: ['忘记密码怎么办？', '密码找不回来了'],
                    vectorSyncStatus: 'ready'
                })
            }),
            3
        )
    })

    it('restores old vectors when the canonical update fails', async () => {
        const fixture = createFixture({
            existingChunks: [createExistingFAQChunk()],
            updateError: new Error('version conflict')
        })

        await expect(
            fixture.service.update(fixture.knowledgebase.id, 'faq-existing', {
                ...input,
                similarQuestions: ['忘记密码怎么办？', '密码找不回来了'],
                version: 3
            })
        ).rejects.toThrow('version conflict')

        expect(fixture.vectorStore.addKnowledgeChunks).toHaveBeenCalledTimes(2)
        expect(fixture.vectorStore.deleteChunks).toHaveBeenCalledWith([
            createFAQLogicalVectorId('faq-existing', 'question:0'),
            createFAQLogicalVectorId('faq-existing', 'question:1'),
            createFAQLogicalVectorId('faq-existing', 'question:2'),
            createFAQLogicalVectorId('faq-existing', 'answer:0'),
            createFAQLogicalVectorId('faq-existing', 'answer:1')
        ])
    })

    it('reports a distinct recovery failure when old vectors cannot be restored', async () => {
        const fixture = createFixture({
            existingChunks: [createExistingFAQChunk()],
            addVectorsErrors: [new Error('new vectors unavailable'), new Error('old vectors unavailable')]
        })

        await expect(
            fixture.service.update(fixture.knowledgebase.id, 'faq-existing', {
                ...input,
                version: 3
            })
        ).rejects.toMatchObject({
            response: expect.objectContaining({ code: 'knowledge_faq_recovery_failed' })
        })
    })

    it('checks the delete version before removing vectors', async () => {
        const fixture = createFixture({ existingChunks: [createExistingFAQChunk()] })

        await expect(fixture.service.delete(fixture.knowledgebase.id, 'faq-existing', 2)).rejects.toMatchObject({
            status: 409
        })

        expect(fixture.vectorStore.deleteChunks).not.toHaveBeenCalled()
        expect(fixture.chunkService.deleteWithVersion).not.toHaveBeenCalled()
    })

    it('imports valid WeKnora entries and reports row-level failures', async () => {
        const fixture = createFixture()
        const create = jest
            .spyOn(fixture.service, 'create')
            .mockResolvedValueOnce({ id: 'faq-1' } as never)
            .mockRejectedValueOnce(new Error('duplicate question'))

        const result = await fixture.service.importFile(fixture.knowledgebase.id, {
            originalname: 'faq.json',
            buffer: Buffer.from(
                JSON.stringify([
                    { standard_question: 'First', answers: ['Answer'] },
                    { standard_question: 'Second', answers: ['Answer'] }
                ])
            )
        })

        expect(create).toHaveBeenCalledTimes(2)
        expect(result).toEqual({
            total: 2,
            imported: 1,
            failed: [{ row: 2, standardQuestion: 'Second', message: 'duplicate question' }]
        })
    })

    it('previews parsed FAQ records without writing them', async () => {
        const fixture = createFixture()

        const result = await fixture.service.previewImportFile(fixture.knowledgebase.id, {
            originalname: 'faq.json',
            buffer: Buffer.from(
                JSON.stringify([
                    { standard_question: 'First', answers: ['Answer'] },
                    { standard_question: 'Second', answers: ['Answer'] }
                ])
            )
        })

        expect(result).toEqual({
            total: 2,
            items: [
                { row: 1, standardQuestion: 'First' },
                { row: 2, standardQuestion: 'Second' }
            ],
            truncated: false
        })
        expect(fixture.chunkService.create).not.toHaveBeenCalled()
    })

    it('clears existing FAQs before importing a validated replacement file', async () => {
        const fixture = createFixture({ existingChunks: [createExistingFAQChunk()], statefulChunks: true })

        const result = await fixture.service.importFile(
            fixture.knowledgebase.id,
            {
                originalname: 'faq.json',
                buffer: Buffer.from(JSON.stringify([{ standard_question: 'New question', answers: ['New answer'] }]))
            },
            'replace'
        )

        expect(result).toEqual({ total: 1, imported: 1, failed: [] })
        await expect(fixture.service.findAll(fixture.knowledgebase.id)).resolves.toEqual({
            items: [expect.objectContaining({ standardQuestion: 'New question' })],
            total: 1
        })
    })

    it('does not clear existing FAQs when replacement rows conflict with each other', async () => {
        const fixture = createFixture({ existingChunks: [createExistingFAQChunk()], statefulChunks: true })

        const result = await fixture.service.importFile(
            fixture.knowledgebase.id,
            {
                originalname: 'faq.json',
                buffer: Buffer.from(
                    JSON.stringify([
                        { standard_question: 'Same question', answers: ['First answer'] },
                        { standard_question: 'same question', answers: ['Second answer'] }
                    ])
                )
            },
            'replace'
        )

        expect(result.imported).toBe(0)
        expect(result.failed).toEqual([
            expect.objectContaining({ row: 2, standardQuestion: 'same question', message: 'duplicate_question' })
        ])
        await expect(fixture.service.findAll(fixture.knowledgebase.id)).resolves.toEqual({
            items: [expect.objectContaining({ id: 'faq-existing', standardQuestion: '旧问题' })],
            total: 1
        })
    })

    it('keeps the previous FAQ set when staging a replacement row fails', async () => {
        const fixture = createFixture({
            existingChunks: [createExistingFAQChunk()],
            statefulChunks: true,
            addVectorsErrors: [undefined, new Error('embedding unavailable')]
        })

        const result = await fixture.service.importFile(
            fixture.knowledgebase.id,
            {
                originalname: 'faq.json',
                buffer: Buffer.from(
                    JSON.stringify([
                        { standard_question: 'First new question', answers: ['First answer'] },
                        { standard_question: 'Second new question', answers: ['Second answer'] }
                    ])
                )
            },
            'replace'
        )

        expect(result).toEqual({
            total: 2,
            imported: 0,
            failed: [{ row: 2, standardQuestion: 'Second new question', message: 'embedding unavailable' }]
        })
        await expect(fixture.service.findAll(fixture.knowledgebase.id)).resolves.toEqual({
            items: [expect.objectContaining({ id: 'faq-existing', standardQuestion: '旧问题' })],
            total: 1
        })
    })

    it('does not downgrade a replacement cleanup failure to a row-level import failure', async () => {
        const fixture = createFixture({
            existingChunks: [createExistingFAQChunk()],
            statefulChunks: true,
            addVectorsError: new Error('embedding unavailable'),
            deleteVectorsError: new Error('vector cleanup unavailable')
        })

        await expect(
            fixture.service.importFile(
                fixture.knowledgebase.id,
                {
                    originalname: 'faq.json',
                    buffer: Buffer.from(
                        JSON.stringify([{ standard_question: 'New question', answers: ['New answer'] }])
                    )
                },
                'replace'
            )
        ).rejects.toMatchObject({
            response: expect.objectContaining({ code: 'knowledge_faq_recovery_failed' })
        })
    })

    it('restores the previous FAQ with a monotonic version when replacement activation fails', async () => {
        const fixture = createFixture({
            existingChunks: [createExistingFAQChunk()],
            statefulChunks: true,
            updateErrors: [new Error('activation unavailable'), undefined]
        })

        await expect(
            fixture.service.importFile(
                fixture.knowledgebase.id,
                {
                    originalname: 'faq.json',
                    buffer: Buffer.from(
                        JSON.stringify([{ standard_question: 'New question', answers: ['New answer'] }])
                    )
                },
                'replace'
            )
        ).rejects.toThrow('activation unavailable')
        await expect(fixture.service.findAll(fixture.knowledgebase.id)).resolves.toEqual({
            items: [expect.objectContaining({ id: 'faq-existing', standardQuestion: '旧问题', version: 4 })],
            total: 1
        })
    })

    it('exports every ready FAQ entry in WeKnora CSV format', async () => {
        const fixture = createFixture({ existingChunks: [createExistingFAQChunk()] })

        const result = await fixture.service.exportFile(fixture.knowledgebase.id, 'csv')

        expect(result.fileName).toMatch(/^faq-export-\d{4}-\d{2}-\d{2}\.csv$/u)
        expect(result.contentType).toBe('text/csv; charset=utf-8')
        expect(result.content.toString('utf8')).toContain('标签(必填),问题(必填)')
        expect(result.content.toString('utf8')).toContain('旧问题')
    })

    it('exports only selected ready FAQ entries in the requested order', async () => {
        const first = createExistingFAQChunk()
        const second = {
            ...createExistingFAQChunk(),
            id: 'faq-second',
            metadata: {
                ...createExistingFAQChunk().metadata,
                chunkId: 'faq-second',
                standardQuestion: '第二个问题'
            }
        }
        const fixture = createFixture({ existingChunks: [first, second] })

        const result = await fixture.service.exportFile(fixture.knowledgebase.id, 'json', ['faq-second'])

        expect(result.content.toString('utf8')).toContain('第二个问题')
        expect(result.content.toString('utf8')).not.toContain('旧问题')
    })
})

function createExistingFAQChunk() {
    return {
        id: 'faq-existing',
        knowledgebaseId: 'kb-faq',
        documentId: 'faq-document',
        version: 3,
        metadata: {
            chunkId: 'faq-existing',
            contentKind: 'faq',
            standardQuestion: '旧问题',
            similarQuestions: [],
            answerBlocks: ['旧回答'],
            enabled: true,
            faqVectorIds: [
                createFAQLogicalVectorId('faq-existing', 'question:0'),
                createFAQLogicalVectorId('faq-existing', 'answer:0')
            ],
            vectorSyncStatus: 'ready'
        }
    }
}
