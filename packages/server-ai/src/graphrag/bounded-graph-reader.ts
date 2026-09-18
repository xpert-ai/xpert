import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Brackets, type EntityManager } from 'typeorm'
import {
    RequestContext,
    type KnowledgeGraphEntityQuery,
    type KnowledgeGraphNeighborhoodQuery,
    type KnowledgeGraphReadResult,
    type KnowledgeGraphReadScope
} from '@xpert-ai/plugin-sdk'
import { XpertAgent } from '../xpert-agent/xpert-agent.entity'
import type { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import {
    KnowledgeGraphEntity,
    KnowledgeGraphEntityContribution,
    KnowledgeGraphIndexJob,
    KnowledgeGraphRelation,
    KnowledgeGraphRelationContribution
} from './entities'
import { normalizeKnowledgeGraphType } from './identity-write'

const key = z.string().trim().min(1).max(512)
const scope = {
    knowledgebaseId: z.string().uuid(),
    xpertId: z.string().uuid(),
    agentKey: key,
    sources: z
        .array(z.object({ documentId: z.string().uuid(), sourceVersion: key }).strict())
        .min(1)
        .max(50)
}
const entityQuery = z
    .object({
        ...scope,
        entityIds: z.array(z.string().uuid()).min(1).max(50).optional(),
        namespace: key.optional(),
        nodeKey: key.optional(),
        type: key.optional(),
        search: z.string().trim().min(1).max(160).optional(),
        cursor: z.string().max(2048).optional(),
        limit: z.number().int().min(1).max(100).default(50)
    })
    .strict()
const neighborhoodQuery = z
    .object({
        ...scope,
        entityIds: z.array(z.string().uuid()).min(1).max(50),
        relationTypes: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
        depth: z.number().int().min(1).max(2).default(1),
        direction: z.enum(['incoming', 'outgoing', 'both']).default('both'),
        cursor: z.string().max(2048).optional(),
        limit: z.number().int().min(1).max(100).default(50)
    })
    .strict()
function invalid(): never {
    throw new BadRequestException(
        t('server-ai:Error.BoundedGraphQueryInvalid', {
            defaultValue: 'Graph query exceeds the supported scope or bounds.'
        })
    )
}
function denied(): never {
    throw new ForbiddenException(
        t('server-ai:Error.BoundedGraphAccessDenied', {
            defaultValue: 'The current Agent cannot read this knowledge graph.'
        })
    )
}
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value && typeof value === 'object')
        return `{${Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
            .join(',')}}`
    return JSON.stringify(value)
}

/** Reads the existing contribution stores, retaining document provenance and bounded traversal. */
export class BoundedGraphReader {
    constructor(
        private readonly manager: EntityManager,
        private readonly knowledgebases: Pick<KnowledgebaseService, 'findOneByIdString'>
    ) {}

    private async authorize(input: KnowledgeGraphReadScope) {
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId || !RequestContext.currentUserId()) denied()
        const kb = await this.knowledgebases.findOneByIdString(input.knowledgebaseId)
        if (kb.tenantId !== tenantId || kb.organizationId !== organizationId || !kb.graphRag?.enabled) denied()
        const agent = await this.manager
            .getRepository(XpertAgent)
            .findOne({ where: { xpertId: input.xpertId, key: input.agentKey, tenantId, organizationId } })
        if (!agent?.knowledgebaseIds?.includes(kb.id)) denied()
        const sources: KnowledgeGraphReadResult['sources'] = []
        for (const requested of input.sources) {
            const document = await this.manager
                .getRepository(KnowledgeDocument)
                .findOneBy({ id: requested.documentId, knowledgebaseId: kb.id, tenantId, organizationId })
            const job = document
                ? await this.manager
                      .getRepository(KnowledgeGraphIndexJob)
                      .findOne({
                          where: { documentId: document.id, knowledgebaseId: kb.id },
                          order: { createdAt: 'DESC', id: 'DESC' },
                          select: {
                              status: true,
                              extractionSnapshot: true,
                              sourceContentHash: true,
                              sourcePublicationEpoch: true
                          }
                      })
                : null
            const publication = job?.extractionSnapshot?.publication
            const current = Boolean(
                document &&
                !document.disabled &&
                !document.hardDeletePendingAt &&
                document.contentHash === job?.sourceContentHash &&
                document.publicationEpoch === job?.sourcePublicationEpoch &&
                publication?.sourceVersion === requested.sourceVersion
            )
            sources.push({ ...requested, status: !current ? 'stale' : (job?.status ?? 'unavailable') })
        }
        return sources
    }

    async query(value: KnowledgeGraphEntityQuery): Promise<KnowledgeGraphReadResult> {
        const parsed = entityQuery.safeParse(value)
        if (!parsed.success) invalid()
        const input = { ...value, limit: parsed.data.limit ?? 50 },
            sources = await this.authorize(input),
            continuation = this.continuation('entity', input)
        const documentIds = sources.filter((s) => s.status === 'success').map((s) => s.documentId)
        if (!documentIds.length) return { entities: [], relations: [], truncated: false, sources }
        const query = this.entities(input.knowledgebaseId, documentIds)
        if (input.entityIds) query.andWhere('e.id IN (:...entityIds)', { entityIds: input.entityIds })
        if (input.namespace) query.andWhere("c.properties ->> 'namespace' = :namespace", { namespace: input.namespace })
        if (input.nodeKey) query.andWhere("c.properties ->> 'nodeKey' = :nodeKey", { nodeKey: input.nodeKey })
        if (input.type) query.andWhere('e.type = :type', { type: normalizeKnowledgeGraphType(input.type) })
        if (input.search)
            query.andWhere('(c.name ILIKE :search OR CAST(c.aliases AS text) ILIKE :search)', {
                search: `%${input.search.replace(/[\\%_]/g, '\\$&')}%`
            })
        if (continuation.after) query.andWhere('e.id > :after', { after: continuation.after })
        // DISTINCT happens in PostgreSQL before LIMIT, so duplicate source contributions do not consume the page.
        const rows = await query
            .distinctOn(['e.id'])
            .limit(input.limit + 1)
            .getMany()
        const page = rows.slice(0, input.limit)
        const contributions = page.length
            ? await this.entities(input.knowledgebaseId, documentIds)
                  .andWhere('e.id IN (:...ids)', { ids: page.map((c) => c.entityId) })
                  .getMany()
            : []
        const current = await this.authorize(input),
            permitted = new Set(current.filter((s) => s.status === 'success').map((s) => s.documentId))
        return {
            entities: this.entityGroups(contributions.filter((c) => permitted.has(c.sourceDocumentIdSnapshot))),
            relations: [],
            truncated: rows.length > input.limit,
            ...(rows.length > input.limit && page.length
                ? { nextCursor: continuation.next(page[page.length - 1].entityId) }
                : {}),
            sources: current
        }
    }

    async neighborhood(value: KnowledgeGraphNeighborhoodQuery): Promise<KnowledgeGraphReadResult> {
        const parsed = neighborhoodQuery.safeParse(value)
        if (!parsed.success) invalid()
        const input = {
            ...value,
            limit: parsed.data.limit ?? 50,
            depth: parsed.data.depth ?? 1,
            direction: parsed.data.direction ?? 'both'
        }
        if (input.cursor && input.depth !== 1) invalid()
        const continuation = this.continuation('neighborhood', input),
            sources = await this.authorize(input)
        const documentIds = sources.filter((s) => s.status === 'success').map((s) => s.documentId)
        const result: KnowledgeGraphReadResult = { entities: [], relations: [], truncated: false, sources }
        if (!documentIds.length) return result
        const seeds = await this.entities(input.knowledgebaseId, documentIds)
            .andWhere('e.id IN (:...ids)', { ids: input.entityIds })
            .distinctOn(['e.id'])
            .getMany()
        const seen = new Set(seeds.map((c) => c.entityId)),
            selected = new Set<string>()
        let frontier = [...seen]
        for (let depth = 0; depth < input.depth && frontier.length; depth++) {
            const remaining = input.limit - selected.size
            if (!remaining) {
                result.truncated = true
                break
            }
            const query = this.relations(input.knowledgebaseId, documentIds).andWhere('r.type IN (:...types)', {
                types: input.relationTypes.map(normalizeKnowledgeGraphType)
            })
            if (input.direction === 'outgoing') query.andWhere('r.sourceEntityId IN (:...frontier)', { frontier })
            else if (input.direction === 'incoming') query.andWhere('r.targetEntityId IN (:...frontier)', { frontier })
            else
                query.andWhere(
                    new Brackets((q) =>
                        q
                            .where('r.sourceEntityId IN (:...frontier)', { frontier })
                            .orWhere('r.targetEntityId IN (:...frontier)', { frontier })
                    )
                )
            if (selected.size) query.andWhere('r.id NOT IN (:...selected)', { selected: [...selected] })
            if (continuation.after) query.andWhere('r.id > :after', { after: continuation.after })
            const rows = await query
                    .distinctOn(['r.id'])
                    .limit(remaining + 1)
                    .getMany(),
                page = rows.slice(0, remaining)
            if (rows.length > remaining) {
                result.truncated = true
                if (input.depth === 1 && page.length)
                    result.nextCursor = continuation.next(page[page.length - 1].relationId)
            }
            const next = new Set<string>()
            for (const c of page) {
                const r = c.relation
                if (!r.sourceEntityId || !r.targetEntityId) {
                    result.truncated = true
                    continue
                }
                selected.add(r.id)
                for (const id of [r.sourceEntityId, r.targetEntityId])
                    if (!seen.has(id)) {
                        seen.add(id)
                        next.add(id)
                    }
            }
            frontier = [...next]
        }
        // A bounded edge page owns its endpoints. Do not apply a second LIMIT that can sever paths.
        const entityRows = seen.size
            ? await this.entities(input.knowledgebaseId, documentIds)
                  .andWhere('e.id IN (:...ids)', { ids: [...seen] })
                  .getMany()
            : []
        const relationRows = selected.size
            ? await this.relations(input.knowledgebaseId, documentIds)
                  .andWhere('r.id IN (:...ids)', { ids: [...selected] })
                  .getMany()
            : []
        result.sources = await this.authorize(input)
        const permitted = new Set(result.sources.filter((s) => s.status === 'success').map((s) => s.documentId))
        result.entities = this.entityGroups(entityRows.filter((c) => permitted.has(c.sourceDocumentIdSnapshot)))
        const returned = new Set(result.entities.map((e) => e.id)),
            relations = new Map<string, KnowledgeGraphReadResult['relations'][number]>()
        for (const c of relationRows) {
            const r = c.relation
            if (
                !permitted.has(c.sourceDocumentIdSnapshot) ||
                !returned.has(r.sourceEntityId) ||
                !returned.has(r.targetEntityId)
            ) {
                result.truncated = true
                continue
            }
            const previous = relations.get(r.id)
            if (previous)
                previous.documentIds = [...new Set([...(previous.documentIds ?? []), c.sourceDocumentIdSnapshot])]
            else
                relations.set(r.id, {
                    id: r.id,
                    source: r.sourceEntityId,
                    target: r.targetEntityId,
                    type: r.type,
                    properties: c.properties ?? {},
                    documentId: c.sourceDocumentIdSnapshot,
                    documentIds: [c.sourceDocumentIdSnapshot]
                })
        }
        result.relations = [...relations.values()]
        return result
    }
    private relations(kb: string, documents: string[]) {
        return this.manager
            .getRepository(KnowledgeGraphRelationContribution)
            .createQueryBuilder('c')
            .innerJoinAndMapOne(
                'c.relation',
                KnowledgeGraphRelation,
                'r',
                'r.id = c.relationId AND r.knowledgebaseId = c.knowledgebaseId'
            )
            .innerJoin(
                KnowledgeDocument,
                'd',
                'd.id = c.sourceDocumentIdSnapshot AND d.contentHash = c.sourceContentHash AND d.publicationEpoch = c.sourcePublicationEpoch'
            )
            .where('c.knowledgebaseId = :kb AND c.sourceDocumentIdSnapshot IN (:...documents)', { kb, documents })
            .andWhere("(r.visibility = 'active' OR r.visibility IS NULL)")
            .orderBy('r.id', 'ASC')
            .addOrderBy('c.sourceDocumentIdSnapshot', 'ASC')
    }
    private continuation(kind: string, input: KnowledgeGraphEntityQuery | KnowledgeGraphNeighborhoodQuery) {
        const { cursor, ...parameters } = input
        const signature = createHash('sha256')
            .update(canonical([kind, parameters]))
            .digest('hex')
        let after: string | undefined
        if (cursor) {
            try {
                const value = z
                    .object({ signature: z.literal(signature), after: z.string().uuid() })
                    .strict()
                    .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()))
                after = value.after
            } catch {
                invalid()
            }
        }
        return {
            after,
            next: (id: string) => Buffer.from(JSON.stringify({ signature, after: id })).toString('base64url')
        }
    }
    private entityGroups(rows: KnowledgeGraphEntityContribution[]) {
        const grouped = new Map<string, KnowledgeGraphReadResult['entities'][number]>()
        for (const c of rows) {
            const previous = grouped.get(c.entityId)
            if (previous)
                previous.documentIds = [...new Set([...(previous.documentIds ?? []), c.sourceDocumentIdSnapshot])]
            else grouped.set(c.entityId, { ...this.entity(c), documentIds: [c.sourceDocumentIdSnapshot] })
        }
        return [...grouped.values()]
    }
    private entities(kb: string, documents: string[]) {
        return this.manager
            .getRepository(KnowledgeGraphEntityContribution)
            .createQueryBuilder('c')
            .innerJoinAndMapOne(
                'c.entity',
                KnowledgeGraphEntity,
                'e',
                'e.id = c.entityId AND e.knowledgebaseId = c.knowledgebaseId'
            )
            .innerJoin(
                KnowledgeDocument,
                'd',
                'd.id = c.sourceDocumentIdSnapshot AND d.contentHash = c.sourceContentHash AND d.publicationEpoch = c.sourcePublicationEpoch'
            )
            .where('c.knowledgebaseId = :kb AND c.sourceDocumentIdSnapshot IN (:...documents)', { kb, documents })
            .andWhere("(e.visibility = 'active' OR e.visibility IS NULL)")
            .orderBy('e.id', 'ASC')
            .addOrderBy('c.sourceDocumentIdSnapshot', 'ASC')
    }
    private entity(c: KnowledgeGraphEntityContribution) {
        return {
            id: c.entityId,
            name: c.name,
            type: c.entity.type,
            properties: c.properties ?? {},
            documentId: c.sourceDocumentIdSnapshot
        }
    }
}
