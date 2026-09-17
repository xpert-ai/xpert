import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { KBDocumentStatusEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeAutomaticTaggingService } from '../../knowledge-document/tags/automatic-tagging.service'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { CopilotModelService } from '../../copilot-model/copilot-model.service'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import { Tag } from '@xpert-ai/server-core'
import { KnowledgebaseTag } from './knowledgebase-tag.entity'
import { KnowledgeDocumentTag } from './document-tag.entity'
import { KnowledgeTagService } from './knowledge-tag.service'

const pgDescribe = process.env.KNOWLEDGE_TAGGING_PG_URL ? describe : describe.skip
const baseColumns = {
    id: { type: 'uuid' as const, primary: true, generated: 'uuid' as const },
    tenantId: { type: 'uuid' as const },
    organizationId: { type: 'uuid' as const, nullable: true },
    createdAt: { type: 'timestamptz' as const, createDate: true },
    updatedAt: { type: 'timestamptz' as const, updateDate: true }
}
const schemas = [
    new EntitySchema<KnowledgeDocumentChunk>({
        name: 'KnowledgeDocumentChunk',
        target: KnowledgeDocumentChunk,
        tableName: 'knowledge_document_chunk',
        columns: {
            ...baseColumns,
            documentId: { type: 'uuid' },
            knowledgebaseId: { type: 'uuid' },
            pageContent: { type: 'text' },
            metadata: { type: 'jsonb', nullable: true }
        }
    }),
    new EntitySchema<Knowledgebase>({
        name: 'Knowledgebase',
        target: Knowledgebase,
        tableName: 'knowledgebase',
        columns: {
            ...baseColumns,
            name: { type: 'varchar', nullable: true },
            type: { type: 'varchar', default: 'standard' },
            automaticTagging: { type: 'jsonb', nullable: true },
            chatModelId: { type: 'uuid', nullable: true }
        }
    }),
    new EntitySchema<KnowledgeDocument>({
        name: 'KnowledgeDocument',
        target: KnowledgeDocument,
        tableName: 'knowledge_document',
        columns: {
            ...baseColumns,
            knowledgebaseId: { type: 'uuid' },
            name: { type: 'varchar', nullable: true },
            status: { type: 'varchar', default: 'finish' },
            disabled: { type: 'boolean', default: false },
            publicationEpoch: { type: 'int', default: 1 },
            tagRevision: { type: 'int', default: 0, select: false },
            autoTaggingInputHash: { type: 'varchar', nullable: true, select: false },
            contentHash: { type: 'varchar', nullable: true },
            processingHash: { type: 'varchar', nullable: true },
            metadata: { type: 'jsonb', nullable: true },
            deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
            hardDeletePendingAt: { type: 'timestamptz', nullable: true }
        }
    }),
    new EntitySchema<Tag>({
        name: 'Tag',
        target: Tag,
        tableName: 'tag',
        columns: {
            ...baseColumns,
            name: { type: 'varchar' },
            description: { type: 'varchar', nullable: true },
            targets: { type: 'json', nullable: true },
            isActive: { type: 'boolean', default: true }
        }
    }),
    new EntitySchema<KnowledgebaseTag>({
        name: 'KnowledgebaseTag',
        target: KnowledgebaseTag,
        tableName: 'knowledgebase_tag',
        columns: { ...baseColumns, knowledgebaseId: { type: 'uuid' }, tagId: { type: 'uuid' } },
        uniques: [{ columns: ['knowledgebaseId', 'tagId'] }],
        relations: {
            knowledgebase: {
                type: 'many-to-one',
                target: 'Knowledgebase',
                joinColumn: { name: 'knowledgebaseId' },
                onDelete: 'CASCADE'
            },
            tag: { type: 'many-to-one', target: 'Tag', joinColumn: { name: 'tagId' }, onDelete: 'RESTRICT' }
        }
    }),
    new EntitySchema<KnowledgeDocumentTag>({
        name: 'KnowledgeDocumentTag',
        target: KnowledgeDocumentTag,
        tableName: 'knowledge_document_tag',
        columns: {
            ...baseColumns,
            documentId: { type: 'uuid' },
            tagId: { type: 'uuid' },
            source: { type: 'varchar' },
            confidence: { type: 'float', nullable: true }
        },
        uniques: [{ columns: ['documentId', 'tagId'] }],
        relations: {
            tag: { type: 'many-to-one', target: 'Tag', joinColumn: { name: 'tagId' }, onDelete: 'RESTRICT' },
            document: {
                type: 'many-to-one',
                target: 'KnowledgeDocument',
                joinColumn: { name: 'documentId' },
                onDelete: 'CASCADE'
            }
        }
    })
]

pgDescribe('Knowledge tags with PostgreSQL transactions', () => {
    let db: DataSource
    let service: KnowledgeTagService
    let kb: Knowledgebase
    let document: KnowledgeDocument
    let tenantId: string
    let auth: { findOne: jest.Mock; assertKnowledgebaseWriteAccess: jest.Mock; canManageKnowledgebase: jest.Mock }

    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            url: process.env.KNOWLEDGE_TAGGING_PG_URL,
            entities: schemas,
            synchronize: true
        }).initialize()
    })
    afterAll(async () => {
        await db?.destroy()
    })
    beforeEach(async () => {
        tenantId = randomUUID()
        kb = await db
            .getRepository(Knowledgebase)
            .save({ tenantId, name: 'KB', type: KnowledgebaseTypeEnum.Standard, automaticTagging: { enabled: true } })
        document = await db
            .getRepository(KnowledgeDocument)
            .save({ tenantId, knowledgebaseId: kb.id, status: KBDocumentStatusEnum.FINISH })
        auth = {
            canManageKnowledgebase: jest.fn().mockResolvedValue(true),
            findOne: jest.fn(async (id: string) => db.getRepository(Knowledgebase).findOneByOrFail({ id, tenantId })),
            assertKnowledgebaseWriteAccess: jest.fn(async (id: string) =>
                db.getRepository(Knowledgebase).findOneByOrFail({ id, tenantId })
            )
        }
        service = new KnowledgeTagService(db.getRepository(Tag), auth as unknown as KnowledgebaseService)
    })
    const create = async (name: string, knowledgebaseId = kb.id) => {
        const tag = await db.getRepository(Tag).save({ tenantId, name, targets: ['knowledgebase'] })
        await service.select(knowledgebaseId, tag.id)
        return tag
    }
    const context = () => service.context(kb.id, document.id)

    it('adds imported tags as manual without removing existing assignments, and deduplicates reused documents', async () => {
        const first = await create('First')
        const second = await create('Second')
        await service.setManual(kb.id, document.id, first.id)
        await db
            .getRepository(KnowledgeDocumentTag)
            .update({ documentId: document.id, tagId: first.id }, { source: 'automatic', confidence: 0.8 })
        await db.transaction(async (manager) => {
            const locked = await service.lockImportKnowledgebase(manager, kb.id)
            await service.assignImported(manager, locked, [document, document], [first.id, second.id, second.id])
        })
        const assignments = await service.documentTags(kb.id, document.id)
        expect(assignments.map((item) => item.tagId).sort()).toEqual([first.id, second.id].sort())
        expect(assignments.every((item) => item.source === 'manual' && item.confidence === null)).toBe(true)
    })

    it('rolls back a newly imported document when a chosen tag is no longer available', async () => {
        const tag = await create('Disabled')
        await db.getRepository(Tag).update(tag.id, { isActive: false })
        const id = randomUUID()
        await expect(
            db.transaction(async (manager) => {
                const locked = await service.lockImportKnowledgebase(manager, kb.id)
                const added = await manager
                    .getRepository(KnowledgeDocument)
                    .save({ id, tenantId, knowledgebaseId: kb.id })
                await service.assignImported(manager, locked, [added], [tag.id])
            })
        ).rejects.toThrow()
        expect(await db.getRepository(KnowledgeDocument).findOneBy({ id })).toBeNull()
    })

    it('rejects unselected tags and preserves unrelated manual tags', async () => {
        const chosen = await create('Chosen')
        const existing = await create('Existing')
        await service.setManual(kb.id, document.id, existing.id)
        await db.transaction(async (manager) => {
            const locked = await service.lockImportKnowledgebase(manager, kb.id)
            await service.assignImported(manager, locked, [document], [chosen.id])
        })
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(2)
        await service.select(kb.id, chosen.id, true)
        await expect(
            db.transaction(async (manager) => {
                const locked = await service.lockImportKnowledgebase(manager, kb.id)
                await service.assignImported(manager, locked, [document], [chosen.id])
            })
        ).rejects.toThrow()
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(2)
    })

    it('runs the bounded SQL sampler over body, OCR, images and a summary before classifying', async () => {
        const tag = await create('Operations')
        await db.getRepository(Knowledgebase).update(kb.id, {
            automaticTagging: { enabled: true, model: { copilotId: 'provider', model: 'classifier' } }
        })
        await db.getRepository(KnowledgeDocument).save({
            id: document.id,
            name: 'file.pdf',
            metadata: { summary: 'Existing summary', originalFileName: 'original.pdf' }
        })
        await db.getRepository(KnowledgeDocumentChunk).save([
            {
                documentId: document.id,
                knowledgebaseId: kb.id,
                tenantId,
                pageContent: 'BODY_START' + 'x'.repeat(30000) + 'BODY_MIDDLE' + 'x'.repeat(30000) + 'BODY_END',
                metadata: { chunkId: 'body' }
            },
            {
                documentId: document.id,
                knowledgebaseId: kb.id,
                tenantId,
                pageContent: 'OCR_TEXT',
                metadata: { chunkId: 'ocr' }
            },
            {
                documentId: document.id,
                knowledgebaseId: kb.id,
                tenantId,
                pageContent: 'IMAGE_DESCRIPTION',
                metadata: { chunkId: 'image', mediaType: 'image' }
            }
        ])
        const invoke = jest.fn().mockResolvedValue({ content: '{"tags":[{"number":1,"confidence":0.9}]}' })
        const models = { createModelClient: jest.fn().mockResolvedValue({ invoke }) }
        const classifier = new KnowledgeAutomaticTaggingService(
            service,
            db.getRepository(KnowledgeDocumentChunk),
            models as unknown as AgentMiddlewareRuntimeService,
            {} as CopilotModelService
        )
        await classifier.process(kb.id, document.id)
        const text: string = JSON.parse(invoke.mock.calls[0][0][1].content).document
        expect(text.length).toBeLessThanOrEqual(12000)
        for (const marker of [
            'BODY_START',
            'BODY_MIDDLE',
            'BODY_END',
            'OCR_TEXT',
            'IMAGE_DESCRIPTION',
            'Existing summary',
            'original.pdf'
        ])
            expect(text).toContain(marker)
        expect(await service.documentTags(kb.id, document.id)).toEqual([
            expect.objectContaining({ tagId: tag.id, source: 'automatic' })
        ])
        await classifier.process(kb.id, document.id)
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it.each([49, 50, 51, 60])('bounds %s tied candidates by original id in stable order', async (count) => {
        const tags = await Promise.all(Array.from({ length: count }, (_, i) => create(`Tag ${i}`)))
        const sameTime = new Date('2026-01-01T00:00:00Z')
        await db.getRepository(Tag).update({ tenantId }, { createdAt: sameTime })
        const other = await db.getRepository(Knowledgebase).save({ tenantId })
        await create('Out of scope', other.id)
        const expected = tags
            .map(({ id }) => id)
            .sort()
            .slice(0, 50)
        expect((await service.candidates(await context())).map(({ id }) => id)).toEqual(expected)
        expect((await service.candidates(await context())).map(({ id }) => id)).toEqual(expected)
    })

    it('appends a new result without replacing prior automatic labels and fills only remaining capacity', async () => {
        const tags = await Promise.all(Array.from({ length: 4 }, (_, i) => create(`Incremental ${i}`)))
        let snapshot = await context()
        const candidates = await service.candidates(snapshot)
        await service.appendAutomatic(
            snapshot,
            candidates,
            tags.slice(0, 2).map(({ id }) => ({ tagId: id, confidence: 0.9 })),
            'first'
        )
        const original = await service.documentTags(kb.id, document.id)
        snapshot = await context()
        await service.appendAutomatic(
            snapshot,
            candidates,
            tags.slice(2).map(({ id }) => ({ tagId: id, confidence: 0.9 })),
            'second'
        )
        const result = await service.documentTags(kb.id, document.id)
        expect(result).toHaveLength(3)
        expect(result.map(({ id }) => id)).toEqual(expect.arrayContaining(original.map(({ id }) => id)))
        expect(result.filter(({ tagId }) => tags.slice(2).some(({ id }) => id === tagId))).toHaveLength(1)
    })

    it.each([true, false])(
        'preserves five historical labels after reducing the cap with enabled=%s',
        async (enabled) => {
            const tags = await Promise.all(Array.from({ length: 6 }, (_, i) => create(`Historical ${i}`)))
            await db.getRepository(Knowledgebase).update(kb.id, { automaticTagging: { enabled: true, maxTags: 5 } })
            let snapshot = await context()
            const candidates = await service.candidates(snapshot)
            await service.appendAutomatic(
                snapshot,
                candidates,
                tags.slice(0, 5).map(({ id }) => ({ tagId: id, confidence: 0.9 })),
                'first'
            )
            const original = await service.documentTags(kb.id, document.id)
            await db.getRepository(Knowledgebase).update(kb.id, { automaticTagging: { enabled, maxTags: 3 } })
            snapshot = await context()
            await service.appendAutomatic(snapshot, candidates, [{ tagId: tags[5].id, confidence: 0.9 }], 'second')
            expect((await service.documentTags(kb.id, document.id)).map(({ id }) => id).sort()).toEqual(
                original.map(({ id }) => id).sort()
            )
            expect(original).toHaveLength(5)
        }
    )

    it('reuses the original Tag id and deduplicates concurrent knowledgebase and document associations', async () => {
        const tag = await create('Finance')
        await Promise.all(Array.from({ length: 5 }, () => service.select(kb.id, tag.id)))
        expect(await db.getRepository(Tag).countBy({ tenantId })).toBe(1)
        expect(await db.getRepository(KnowledgebaseTag).countBy({ knowledgebaseId: kb.id })).toBe(1)
        await Promise.all(Array.from({ length: 5 }, () => service.setManual(kb.id, document.id, tag.id)))
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(1)
    })

    it('commits one classification result for concurrent retries, even if the model returns different labels', async () => {
        const first = await create('First')
        const second = await create('Second')
        const snapshot = await context()
        const candidates = await service.candidates(snapshot)
        await Promise.all([
            service.appendAutomatic(snapshot, candidates, [{ tagId: first.id, confidence: 0.9 }], 'same-input'),
            service.appendAutomatic(snapshot, candidates, [{ tagId: second.id, confidence: 0.9 }], 'same-input')
        ])
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(1)
        const after = await context()
        expect(after.document.autoTaggingInputHash).toBe('same-input')
        await service.appendAutomatic(after, candidates, [{ tagId: second.id, confidence: 0.9 }], 'same-input')
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(1)
    })

    it('filters unauthorized or invalid selections and applies the per-document cap across attempts', async () => {
        const tags = await Promise.all(Array.from({ length: 6 }, (_, i) => create(`T${i}`)))
        let snapshot = await context()
        const candidates = await service.candidates(snapshot)
        await service.appendAutomatic(
            snapshot,
            candidates,
            [
                { tagId: randomUUID(), confidence: 1 },
                { tagId: tags[0].id, confidence: 0.1 },
                ...tags.map(({ id }) => ({ tagId: id, confidence: 0.9 }))
            ],
            'first'
        )
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(3)
        snapshot = await context()
        await service.appendAutomatic(
            snapshot,
            candidates,
            tags.map(({ id }) => ({ tagId: id, confidence: 0.9 })),
            'second'
        )
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(3)
    })

    it('does not dilute manual tags unless mixing is enabled', async () => {
        const manual = await create('Manual')
        const automatic = await create('Automatic')
        await service.setManual(kb.id, document.id, manual.id)
        let snapshot = await context()
        const candidates = await service.candidates(snapshot)
        expect(
            await service.appendAutomatic(snapshot, candidates, [{ tagId: automatic.id, confidence: 0.9 }], 'first')
        ).toEqual([])
        await db
            .getRepository(Knowledgebase)
            .update(kb.id, { automaticTagging: { enabled: true, allowWithManualTags: true } })
        snapshot = await context()
        await service.appendAutomatic(snapshot, candidates, [{ tagId: automatic.id, confidence: 0.9 }], 'second')
        expect((await service.documentTags(kb.id, document.id)).map(({ source }) => source).sort()).toEqual([
            'automatic',
            'manual'
        ])
    })

    it.each(['manual', 'source', 'config', 'catalog', 'deleted', 'disabled'] as const)(
        'rejects a classification invalidated by a concurrent %s change',
        async (change) => {
            const tag = await create('Finance')
            const snapshot = await context()
            const candidates = await service.candidates(snapshot)
            if (change === 'manual') await service.setManual(kb.id, document.id, tag.id)
            if (change === 'source')
                await db.getRepository(KnowledgeDocument).increment({ id: document.id }, 'publicationEpoch', 1)
            if (change === 'config')
                await db.getRepository(Knowledgebase).update(kb.id, { automaticTagging: { enabled: false } })
            if (change === 'catalog') await service.select(kb.id, tag.id, true)
            if (change === 'deleted') await db.getRepository(KnowledgeDocument).softDelete(document.id)
            if (change === 'disabled') await db.getRepository(KnowledgeDocument).update(document.id, { disabled: true })
            expect(
                await service.appendAutomatic(snapshot, candidates, [{ tagId: tag.id, confidence: 0.9 }], 'input')
            ).toEqual([])
            expect(
                await db.getRepository(KnowledgeDocumentTag).countBy({ documentId: document.id, source: 'automatic' })
            ).toBe(0)
        }
    )

    it('preserves manual promotions and removals when the same paid result is retried', async () => {
        const tag = await create('Finance')
        let snapshot = await context()
        const candidates = await service.candidates(snapshot)
        await service.appendAutomatic(snapshot, candidates, [{ tagId: tag.id, confidence: 0.9 }], 'input')
        await service.setManual(kb.id, document.id, tag.id)
        expect((await service.documentTags(kb.id, document.id))[0]).toMatchObject({
            source: 'manual',
            confidence: null
        })
        await service.setManual(kb.id, document.id, tag.id, true)
        snapshot = await context()
        await service.appendAutomatic(snapshot, candidates, [{ tagId: tag.id, confidence: 0.9 }], 'input')
        expect(await service.documentTags(kb.id, document.id)).toEqual([])
    })

    it('fails closed for cross-knowledgebase document/tag ids and denied access', async () => {
        const other = await db.getRepository(Knowledgebase).save({ tenantId })
        const foreign = await create('Foreign', other.id)
        await expect(service.context(other.id, document.id)).rejects.toThrow()
        await expect(service.setManual(kb.id, document.id, foreign.id)).rejects.toThrow()
        auth.assertKnowledgebaseWriteAccess.mockRejectedValue(new Error('denied'))
        await expect(create('Denied')).rejects.toThrow('denied')
    })

    it('records abstention and preserves document associations after unselecting a knowledgebase tag', async () => {
        const tag = await create('Tag')
        let snapshot = await context()
        const candidates = await service.candidates(snapshot)
        await service.appendAutomatic(snapshot, candidates, [], 'empty-input')
        snapshot = await context()
        expect(snapshot.document.autoTaggingInputHash).toBe('empty-input')
        await service.appendAutomatic(snapshot, candidates, [{ tagId: tag.id, confidence: 0.9 }], 'empty-input')
        expect(await service.documentTags(kb.id, document.id)).toEqual([])
        await service.setManual(kb.id, document.id, tag.id)
        await service.select(kb.id, tag.id, true)
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(1)
        expect(await db.getRepository(Tag).findOneBy({ id: tag.id })).not.toBeNull()
        await expect(db.getRepository(Tag).delete(tag.id)).rejects.toThrow()
    })
    it.each(['inactive', 'wrong-target', 'other-organization', 'other-tenant'] as const)(
        'rejects new knowledgebase associations to %s definitions',
        async (reason) => {
            const tag = await db.getRepository(Tag).save({
                tenantId,
                name: 'Unavailable',
                targets: ['knowledgebase'],
                ...(reason === 'inactive' ? { isActive: false } : {}),
                ...(reason === 'wrong-target' ? { targets: ['integration'] } : {}),
                ...(reason === 'other-organization' ? { organizationId: randomUUID() } : {}),
                ...(reason === 'other-tenant' ? { tenantId: randomUUID() } : {})
            })
            await expect(service.select(kb.id, tag.id)).rejects.toThrow()
            expect(await service.candidates(await context())).toEqual([])
        }
    )

    it('accepts current-organization and tenant-shared knowledgebase tags only', async () => {
        const organizationId = randomUUID()
        await db.getRepository(Knowledgebase).update(kb.id, { organizationId })
        const own = await db
            .getRepository(Tag)
            .save({ tenantId, organizationId, name: 'Own', targets: ['knowledgebase'] })
        await service.select(kb.id, own.id)
        const shared = await create('Shared')
        expect((await service.candidates(await context())).map(({ id }) => id).sort()).toEqual(
            [own.id, shared.id].sort()
        )
    })

    it.each(['disable', 'retarget', 'rename'] as const)(
        'drops a result after directory %s during classification',
        async (change) => {
            const tag = await create('Finance')
            const snapshot = await context()
            const candidates = await service.candidates(snapshot)
            await db
                .getRepository(Tag)
                .update(
                    tag.id,
                    change === 'disable'
                        ? { isActive: false }
                        : change === 'retarget'
                          ? { targets: ['integration'] }
                          : { name: 'Renamed' }
                )
            expect(
                await service.appendAutomatic(snapshot, candidates, [{ tagId: tag.id, confidence: 0.9 }], 'old')
            ).toEqual([])
            expect(await service.documentTags(kb.id, document.id)).toEqual([])
        }
    )

    it('retains disabled historical labels while rejecting new manual assignments', async () => {
        const tag = await create('Finance')
        await service.setManual(kb.id, document.id, tag.id)
        await db.getRepository(Tag).update(tag.id, { isActive: false })
        expect(await service.candidates(await context())).toEqual([])
        const catalog = await service.list(kb.id)
        expect(catalog.tags[0]).toMatchObject({ id: tag.id, isActive: false })
        expect(catalog.available).toEqual([])
        expect(await service.documentTags(kb.id, document.id)).toHaveLength(1)
        await service.setManual(kb.id, document.id, tag.id, true)
        await expect(service.setManual(kb.id, document.id, tag.id)).rejects.toThrow()
    })

    it('returns read-only capability and denies association writes without knowledgebase write access', async () => {
        const tag = await create('Finance')
        auth.canManageKnowledgebase.mockResolvedValue(false)
        auth.assertKnowledgebaseWriteAccess.mockRejectedValue(new Error('denied'))
        expect((await service.list(kb.id)).canEdit).toBe(false)
        await expect(service.select(kb.id, tag.id, true)).rejects.toThrow('denied')
        await expect(service.setManual(kb.id, document.id, tag.id)).rejects.toThrow('denied')
    })
})
