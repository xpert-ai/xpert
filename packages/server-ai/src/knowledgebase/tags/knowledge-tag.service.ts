// Lock order: knowledgebase -> document -> tag definitions. Directory writers lock definitions;
// candidate reads hold shared locks until association commit, so disable/delete cannot race additions.
import {
    IKnowledgeDocumentTag,
    ITagKnowledgebaseUsage,
    IPagination,
    ITag,
    KnowledgeTagCatalog,
    KBDocumentStatusEnum,
    KNOWLEDGE_AUTOMATIC_TAG_CANDIDATES
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, Tag } from '@xpert-ai/server-core'
import { EntityManager, IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { AutomaticTagSelection, normalizeAutomaticTagging } from '../../knowledge-document/tags/automatic-tagging'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeDocumentTag } from './document-tag.entity'
import { KnowledgebaseTag } from './knowledgebase-tag.entity'

export type TaggingContext = { knowledgebase: Knowledgebase; document: KnowledgeDocument }

@Injectable()
export class KnowledgeTagService {
    constructor(
        @InjectRepository(Tag) private readonly tags: Repository<Tag>,
        private readonly knowledgebases: KnowledgebaseService
    ) {}

    async usage(tagId: string, skip = 0): Promise<IPagination<ITagKnowledgebaseUsage>> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !RequestContext.currentUserId()) throw new ForbiddenException()
        if (!Number.isSafeInteger(skip) || skip < 0)
            throw new BadRequestException(t('server-ai:Error.InvalidTagUsagePage'))
        const shared = { id: tagId, tenantId, organizationId: IsNull() }
        if (
            !(await this.tags.findOne({
                where: organizationId ? [shared, { ...shared, organizationId }] : shared,
                select: ['id']
            }))
        )
            throw new NotFoundException()
        // Aggregate identifiers only; authorize each parent before disclosing its name or counts.
        const rows: Array<{ id: string; candidate: boolean; documentCount: string }> = await this.tags.manager.query(
            `
            SELECT "id", bool_or("candidate") AS "candidate", sum("documentCount")::text AS "documentCount"
            FROM (
                SELECT "knowledgebaseId" AS "id", true AS "candidate", 0 AS "documentCount"
                FROM knowledgebase_tag WHERE "tagId" = $1 AND "tenantId" = $2
                    AND ($3::uuid IS NULL OR "organizationId" = $3)
                UNION ALL
                SELECT d."knowledgebaseId" AS "id", false AS "candidate", 1 AS "documentCount"
                FROM knowledge_document_tag link JOIN knowledge_document d ON d.id = link."documentId" AND d."tenantId" = link."tenantId"
                WHERE link."tagId" = $1 AND link."tenantId" = $2
                    AND ($3::uuid IS NULL OR link."organizationId" = $3)
            ) usage GROUP BY "id"`,
            [tagId, tenantId, organizationId ?? null]
        )
        const items: ITagKnowledgebaseUsage[] = []
        for (const row of rows) {
            try {
                const kb = await this.knowledgebases.findOne(row.id)
                if (kb.tenantId !== tenantId || (organizationId && kb.organizationId !== organizationId)) continue
                items.push({
                    id: kb.id,
                    name: kb.name,
                    candidate: row.candidate,
                    documentCount: Number(row.documentCount)
                })
            } catch (error) {
                if (!(error instanceof ForbiddenException) && !(error instanceof NotFoundException)) throw error
            }
        }
        items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        return { items: items.slice(skip, skip + 20), total: items.length }
    }

    async list(knowledgebaseId: string): Promise<KnowledgeTagCatalog> {
        const kb = await this.knowledgebases.findOne(knowledgebaseId)
        const links = await this.tags.manager.getRepository(KnowledgebaseTag).find({
            where: this.scope(kb),
            relations: ['tag'],
            order: { createdAt: 'ASC', id: 'ASC' }
        })
        return {
            tags: links.map(({ tag }) => tag),
            available: await this.availableQuery(kb).getMany(),
            canEdit: await this.knowledgebases.canManageKnowledgebase(knowledgebaseId)
        }
    }

    // These endpoints only link/unlink definitions. They never create, rename, disable or delete Tag rows.
    async select(knowledgebaseId: string, tagId: string, remove = false) {
        const kb = await this.knowledgebases.assertKnowledgebaseWriteAccess(knowledgebaseId)
        await this.tags.manager.transaction(async (manager) => {
            const current = await this.lockKnowledgebase(manager, kb, 'pessimistic_write')
            if (!current) throw new NotFoundException()
            const repository = manager.getRepository(KnowledgebaseTag)
            const where = { ...this.scope(kb), tagId }
            if (remove) {
                await repository.delete(where)
                return
            }
            const tag = await this.availableQuery(kb, manager)
                .andWhere('tag.id = :tagId', { tagId })
                .setLock('pessimistic_read')
                .getOne()
            if (!tag) throw this.unavailable()
            await repository
                .createQueryBuilder()
                .insert()
                .values({
                    ...where,
                    organizationId: kb.organizationId
                })
                .orIgnore()
                .execute()
        })
    }

    async context(knowledgebaseId: string, documentId: string, write = true): Promise<TaggingContext> {
        const knowledgebase = write
            ? await this.knowledgebases.assertKnowledgebaseWriteAccess(knowledgebaseId, { relations: ['chatModel'] })
            : await this.knowledgebases.findOne(knowledgebaseId)
        const document = await this.tags.manager
            .getRepository(KnowledgeDocument)
            .createQueryBuilder('document')
            .addSelect(['document.tagRevision', 'document.autoTaggingInputHash'])
            .where({ ...this.scope(knowledgebase), id: documentId })
            .getOne()
        if (!document || document.hardDeletePendingAt) throw new NotFoundException()
        return { knowledgebase, document }
    }

    async documentTags(knowledgebaseId: string, documentId: string) {
        const { document } = await this.context(knowledgebaseId, documentId, false)
        return this.associations(this.tags.manager, document)
    }

    async setManual(knowledgebaseId: string, documentId: string, tagId: string, remove = false) {
        const { knowledgebase, document } = await this.context(knowledgebaseId, documentId)
        await this.tags.manager.transaction(async (manager) => {
            await this.lockKnowledgebase(manager, knowledgebase, 'pessimistic_read')
            const current = await this.lockDocument(manager, document)
            if (!current || current.hardDeletePendingAt) throw new NotFoundException()
            const repo = manager.getRepository(KnowledgeDocumentTag)
            const where = { documentId, tagId, tenantId: document.tenantId }
            const existing = await repo.findOneBy(where)
            if (remove) {
                await repo.delete(where)
            } else if (existing) {
                // Existing history may be confirmed or removed even after a definition is disabled/unselected.
                await repo.update(existing.id, { source: 'manual', confidence: null })
            } else {
                const tag = await this.linkedQuery(knowledgebase, manager, true)
                    .andWhere('tag.id = :tagId', { tagId })
                    .setLock('pessimistic_read', undefined, ['tag'])
                    .getOne()
                if (!tag) throw this.unavailable()
                await repo.insert({ ...where, organizationId: document.organizationId, source: 'manual' })
            }
            await manager.getRepository(KnowledgeDocument).increment({ id: documentId }, 'tagRevision', 1)
        })
        return this.documentTags(knowledgebaseId, documentId)
    }

    async lockImportKnowledgebase(manager: EntityManager, knowledgebaseId: string) {
        const kb = await this.knowledgebases.assertKnowledgebaseWriteAccess(knowledgebaseId)
        const current = await this.lockKnowledgebase(manager, kb, 'pessimistic_write')
        if (!current) throw new NotFoundException()
        return current
    }

    async assignImported(
        manager: EntityManager,
        knowledgebase: Knowledgebase,
        documents: KnowledgeDocument[],
        tagIds: string[]
    ) {
        const ids = [...new Set(tagIds)]
        if (!ids.length) return
        const currentDocuments: KnowledgeDocument[] = []
        // Incremental imports can return existing documents, including duplicates within a batch.
        for (const document of [...new Map(documents.map((doc) => [doc.id, doc])).values()].sort((a, b) =>
            a.id.localeCompare(b.id)
        )) {
            if (document.knowledgebaseId !== knowledgebase.id || document.tenantId !== knowledgebase.tenantId)
                throw new NotFoundException()
            const current = await this.lockDocument(manager, document)
            if (!current || current.hardDeletePendingAt) throw new NotFoundException()
            currentDocuments.push(current)
        }
        const candidates = await this.linkedQuery(knowledgebase, manager)
            .andWhere('tag.id IN (:...ids)', { ids })
            .setLock('pessimistic_read', undefined, ['tag'])
            .getMany()
        if (candidates.length !== ids.length) throw this.unavailable()
        for (const document of currentDocuments) {
            await manager.getRepository(KnowledgeDocumentTag).upsert(
                ids.map((tagId) => ({
                    documentId: document.id,
                    tagId,
                    tenantId: document.tenantId,
                    organizationId: document.organizationId,
                    source: 'manual' as const,
                    confidence: null
                })),
                ['documentId', 'tagId']
            )
            await manager.getRepository(KnowledgeDocument).increment({ id: document.id }, 'tagRevision', 1)
        }
    }

    private availableQuery(kb: Knowledgebase, manager = this.tags.manager) {
        return manager
            .getRepository(Tag)
            .createQueryBuilder('tag')
            .where('tag.tenantId = :tenantId', { tenantId: kb.tenantId })
            .andWhere('(tag.organizationId IS NULL OR tag.organizationId = :organizationId)', {
                organizationId: kb.organizationId ?? null
            })
            .andWhere('tag.isActive IS DISTINCT FROM false')
            .andWhere(`(COALESCE(tag.targets::jsonb, '[]'::jsonb) ? :target)`, { target: 'knowledgebase' })
            .andWhere('length(trim(tag.name)) > 0')
            .orderBy('tag.createdAt', 'ASC')
            .addOrderBy('tag.id', 'ASC')
    }

    private linkedQuery(kb: Knowledgebase, manager = this.tags.manager, active = true) {
        const query = active ? this.availableQuery(kb, manager) : manager.getRepository(Tag).createQueryBuilder('tag')
        return query
            .innerJoin(KnowledgebaseTag, 'assignment', 'assignment.tagId = tag.id')
            .andWhere('assignment.knowledgebaseId = :knowledgebaseId AND assignment.tenantId = :tenantId', {
                knowledgebaseId: kb.id,
                tenantId: kb.tenantId
            })
    }

    private candidateQuery(kb: Knowledgebase, manager = this.tags.manager) {
        return this.linkedQuery(kb, manager).limit(KNOWLEDGE_AUTOMATIC_TAG_CANDIDATES)
    }

    candidates(context: TaggingContext, manager = this.tags.manager) {
        return this.candidateQuery(context.knowledgebase, manager).getMany()
    }

    associations(manager: EntityManager, document: KnowledgeDocument): Promise<KnowledgeDocumentTag[]> {
        return manager.getRepository(KnowledgeDocumentTag).find({
            where: { documentId: document.id, tenantId: document.tenantId },
            relations: ['tag'],
            order: { createdAt: 'ASC', id: 'ASC' }
        })
    }

    existing(context: TaggingContext): Promise<IKnowledgeDocumentTag[]> {
        return this.associations(this.tags.manager, context.document)
    }

    private unavailable() {
        return new BadRequestException(t('server-ai:Error.TagAssociationUnavailable'))
    }

    async appendAutomatic(
        snapshot: TaggingContext,
        candidates: Tag[],
        selected: AutomaticTagSelection[],
        inputHash: string
    ) {
        return this.tags.manager.transaction(async (manager) => {
            const kb = await this.lockKnowledgebase(manager, snapshot.knowledgebase, 'pessimistic_read')
            const doc = await this.lockDocument(manager, snapshot.document)
            if (
                !kb ||
                !doc ||
                doc.disabled ||
                doc.hardDeletePendingAt ||
                doc.status !== KBDocumentStatusEnum.FINISH ||
                doc.publicationEpoch !== snapshot.document.publicationEpoch ||
                doc.tagRevision !== snapshot.document.tagRevision ||
                doc.contentHash !== snapshot.document.contentHash ||
                doc.processingHash !== snapshot.document.processingHash ||
                doc.name !== snapshot.document.name ||
                doc.metadata?.summary !== snapshot.document.metadata?.summary ||
                doc.metadata?.originalFileName !== snapshot.document.metadata?.originalFileName
            )
                return []
            if (doc.autoTaggingInputHash === inputHash) return []
            const config = normalizeAutomaticTagging(kb.automaticTagging)
            if (
                !config.enabled ||
                JSON.stringify(config) !==
                    JSON.stringify(normalizeAutomaticTagging(snapshot.knowledgebase.automaticTagging)) ||
                kb.chatModelId !== snapshot.knowledgebase.chatModelId
            )
                return []
            const currentCandidates = await this.candidateQuery(kb, manager)
                .setLock('pessimistic_read', undefined, ['tag'])
                .getMany()
            const labels = (values: ITag[]) => values.map(({ id, name, description }) => ({ id, name, description }))
            if (JSON.stringify(labels(currentCandidates)) !== JSON.stringify(labels(candidates))) return []
            const existing = await this.associations(manager, doc)
            if (!config.allowWithManualTags && existing.some((item) => item.source === 'manual')) return []
            const capacity = Math.max(0, config.maxTags - existing.filter((item) => item.source === 'automatic').length)
            const ids = new Set(existing.map((item) => item.tagId))
            const allowed = new Set(currentCandidates.map((tag) => tag.id))
            const additions = selected
                .filter(({ tagId, confidence }) => {
                    if (
                        !allowed.has(tagId) ||
                        ids.has(tagId) ||
                        !Number.isFinite(confidence) ||
                        confidence < config.confidenceThreshold ||
                        confidence > 1
                    )
                        return false
                    ids.add(tagId)
                    return true
                })
                .slice(0, capacity)
            if (additions.length)
                await manager
                    .getRepository(KnowledgeDocumentTag)
                    .createQueryBuilder()
                    .insert()
                    .values(
                        additions.map((item) => ({
                            ...item,
                            documentId: doc.id,
                            tenantId: doc.tenantId,
                            organizationId: doc.organizationId,
                            source: 'automatic' as const
                        }))
                    )
                    .orIgnore()
                    .execute()
            await manager.getRepository(KnowledgeDocument).update({ id: doc.id }, { autoTaggingInputHash: inputHash })
            return additions
        })
    }

    private scope(kb: Knowledgebase) {
        return { knowledgebaseId: kb.id, tenantId: kb.tenantId }
    }

    private lockKnowledgebase(
        manager: EntityManager,
        kb: Knowledgebase,
        mode: 'pessimistic_read' | 'pessimistic_write'
    ) {
        return manager
            .getRepository(Knowledgebase)
            .findOne({ where: { id: kb.id, tenantId: kb.tenantId }, lock: { mode } })
    }

    private lockDocument(manager: EntityManager, doc: KnowledgeDocument) {
        return manager
            .getRepository(KnowledgeDocument)
            .createQueryBuilder('document')
            .addSelect(['document.tagRevision', 'document.autoTaggingInputHash'])
            .where({ id: doc.id, knowledgebaseId: doc.knowledgebaseId, tenantId: doc.tenantId })
            .setLock('pessimistic_write')
            .getOne()
    }
}
