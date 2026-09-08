// Invariants: model calls run outside transactions. Commit identity decisions only against the same
// catalogue revision and source generation; the knowledgebase lock arbitrates across workers.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { KnowledgeWikiIdentityDecision, KnowledgeWikiIdentityProfile } from '@xpert-ai/contracts'
import { DataSource, EntityManager, In, Repository } from 'typeorm'
import { v5 as uuidv5 } from 'uuid'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiSourceMapResult, KnowledgeWikiSourceState } from './entities'
import { canMatchWikiIdentity, selectWikiIdentityCandidates, WikiIdentityCandidate } from './knowledge-wiki-dedup'
import {
    KnowledgeWikiDedupModelOutput,
    parseWikiIdentityDescriptor,
    parseWikiIdentityProfile
} from './knowledge-wiki-dedup-model'
import { KnowledgeWikiError } from './knowledge-wiki-error'
import { hashKnowledgeWikiValue, isEligibleKnowledgeWikiSource } from './knowledge-wiki-generation.utils'
import { createKnowledgeWikiResolvedPageIdentity } from './knowledge-wiki-identity'
import { KnowledgeWikiIdentityEmbeddingService } from './knowledge-wiki-identity-embedding.service'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiJobFenceService } from './knowledge-wiki-job-fence.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { KnowledgeWikiPageSchedulerService } from './knowledge-wiki-page-scheduler.service'

@Injectable()
export class KnowledgeWikiIdentityResolverService {
    constructor(
        @InjectRepository(KnowledgeWikiJob) private readonly jobs: Repository<KnowledgeWikiJob>,
        @InjectRepository(KnowledgeWikiSourceMapResult)
        private readonly results: Repository<KnowledgeWikiSourceMapResult>,
        @InjectRepository(KnowledgeWikiPage) private readonly pages: Repository<KnowledgeWikiPage>,
        private readonly dataSource: DataSource,
        private readonly fence: KnowledgeWikiJobFenceService,
        private readonly embeddings: KnowledgeWikiIdentityEmbeddingService,
        private readonly model: KnowledgeWikiModelInvocationService,
        private readonly scheduler: KnowledgeWikiPageSchedulerService,
        private readonly dispatcher: KnowledgeWikiJobDispatcherService
    ) {}

    async process(job: KnowledgeWikiJob) {
        const kb = await this.fence.assert(job)
        const pipeline = await this.jobs.findOne({
            where: { id: job.parentJobId, knowledgebaseId: kb.id, isCurrent: true }
        })
        if (!pipeline || !['source_map', 'rebuild'].includes(pipeline.type) || pipeline.status !== 'succeeded') {
            throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
        }
        const maps =
            pipeline.type === 'rebuild'
                ? await this.jobs.find({
                      where: { parentJobId: pipeline.id, type: 'source_map', isCurrent: true, status: 'succeeded' },
                      order: { sourceDocumentIdSnapshot: 'ASC', id: 'ASC' }
                  })
                : [pipeline]
        if (pipeline.type === 'rebuild' && maps.length !== pipeline.expectedChildren)
            throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
        await this.assertSources(this.dataSource.manager, maps)
        const rows = maps.length
            ? await this.results.find({
                  where: { knowledgebaseId: kb.id, sourceJobId: In(maps.map((map) => map.id)) },
                  order: { sourceDocumentIdSnapshot: 'ASC', candidateKey: 'ASC', id: 'ASC' }
              })
            : []
        for (let ordinal = 0; ordinal < rows.length; ordinal++) {
            const row = rows[ordinal]
            row.identity = parseWikiIdentityDescriptor(row.identity)
            if (row.identity.kind !== row.pageType) throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
            if (row.normalizedPageKey) continue
            let resolved = false
            for (let attempt = 0; attempt < 3 && !resolved; attempt++) {
                await this.fence.assert(job)
                const catalogue = await this.pages.find({
                    where: {
                        knowledgebaseId: kb.id,
                        tenantId: kb.tenantId,
                        organizationId: kb.organizationId,
                        pageType: row.pageType
                    },
                    order: { id: 'ASC' }
                })
                for (const page of catalogue) {
                    if (page.identity) {
                        page.identity = parseWikiIdentityProfile(page.identity)
                        if (page.identity.descriptor.kind !== page.pageType)
                            throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
                    }
                }
                const fingerprint = this.catalogueFingerprint(catalogue)
                let decision: KnowledgeWikiIdentityDecision
                let target: KnowledgeWikiPage | undefined
                if (row.pageType === 'summary') {
                    target = catalogue.find((page) => page.pageKey === `summary:${row.sourceDocumentIdSnapshot}`)
                    decision = {
                        outcome: 'source',
                        reason: 'Summary identity belongs to its source document.',
                        comparedPageIds: []
                    }
                } else {
                    const candidates = catalogue.filter(
                        (page) => page.identity && canMatchWikiIdentity(row.identity, page.identity.descriptor)
                    )
                    await this.embeddings.prepare(job, row, candidates)
                    const selected = selectWikiIdentityCandidates(
                        {
                            canonicalName: row.canonicalName,
                            aliases: row.payload.aliases,
                            descriptor: row.identity,
                            embedding: row.identityEmbedding.vector
                        },
                        candidates.map(
                            (page): WikiIdentityCandidate => ({
                                id: page.id,
                                canonicalName: page.canonicalName,
                                aliases: page.identity.aliases,
                                descriptor: page.identity.descriptor,
                                embedding: page.identity.embedding.vector
                            })
                        )
                    )
                    const judgment = await this.judge(job, kb, row, selected, ordinal)
                    target = judgment.pageId ? candidates.find((page) => page.id === judgment.pageId) : undefined
                    decision = {
                        outcome: judgment.decision === 'different' ? 'new' : judgment.decision,
                        reason: judgment.reason,
                        comparedPageIds: selected.map((candidate) => candidate.id)
                    }
                }
                await this.fence.assert(job)
                resolved = await this.commit(job, kb, maps, row, fingerprint, target, decision)
            }
            if (!resolved) {
                await this.jobs.update(
                    { id: job.id, executionAttempt: job.executionAttempt, status: 'running' },
                    { status: 'queued', lockedAt: null, leaseExpiresAt: null }
                )
                await this.dispatcher.dispatch(job, job.billingPrincipalId, 1000)
                return
            }
        }
        await this.fence.assert(job)
        await this.assertSources(this.dataSource.manager, maps)
        if (!(await this.scheduler.schedulePages(pipeline, job)))
            throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
    }

    private async judge(
        job: KnowledgeWikiJob,
        kb: Knowledgebase,
        row: KnowledgeWikiSourceMapResult,
        candidates: WikiIdentityCandidate[],
        ordinal: number
    ): Promise<KnowledgeWikiDedupModelOutput> {
        if (!candidates.length)
            return {
                decision: 'different',
                pageId: null,
                reason: 'No compatible identity candidates exist in this knowledgebase.'
            }
        const answers: KnowledgeWikiDedupModelOutput[] = []
        for (let offset = 0; offset < candidates.length; offset += 8) {
            const batch = candidates.slice(offset, offset + 8)
            const answer = await this.model.invokeDedupModel(
                job,
                kb,
                {
                    candidateId: row.id,
                    canonicalName: row.canonicalName,
                    aliases: row.payload.aliases,
                    descriptor: row.identity,
                    facts: row.payload.facts,
                    candidates: batch.map(({ embedding, ...candidate }) => candidate)
                },
                ordinal
            )
            if (
                (answer.decision === 'same' && !batch.some((candidate) => candidate.id === answer.pageId)) ||
                (answer.decision !== 'same' && answer.pageId !== null)
            )
                throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
            answers.push(answer)
        }
        const matches = answers.filter((answer) => answer.decision === 'same')
        if (matches.length === 1 && answers.every((answer) => answer.decision !== 'uncertain')) return matches[0]
        if (matches.length > 1 || answers.some((answer) => answer.decision === 'uncertain')) {
            return {
                decision: 'uncertain',
                pageId: null,
                reason: 'The supplied evidence does not identify exactly one compatible canonical entry.'
            }
        }
        return { decision: 'different', pageId: null, reason: answers.map((answer) => answer.reason).join('\n') }
    }

    private catalogueFingerprint(pages: KnowledgeWikiPage[]) {
        return hashKnowledgeWikiValue(
            pages
                .map((page) => [page.id, page.identityRevision ?? 0])
                .sort(([a], [b]) => String(a).localeCompare(String(b)))
        )
    }

    private async assertSources(manager: EntityManager, maps: KnowledgeWikiJob[], lock = false) {
        for (const map of maps) {
            const document = await manager.getRepository(KnowledgeDocument).findOne({
                where: { id: map.sourceDocumentIdSnapshot, knowledgebaseId: map.knowledgebaseId },
                ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {})
            })
            const state = await manager.getRepository(KnowledgeWikiSourceState).findOne({
                where: {
                    knowledgebaseId: map.knowledgebaseId,
                    sourceDocumentIdSnapshot: map.sourceDocumentIdSnapshot
                },
                ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {})
            })
            if (
                !isEligibleKnowledgeWikiSource(document) ||
                !this.fence.isSourceCurrent(map, document) ||
                !state?.eligible ||
                state.lifecycleGeneration !== map.sourceLifecycleGeneration ||
                state.desiredRootJobId !== map.id
            ) {
                throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
            }
        }
    }

    private commit(
        job: KnowledgeWikiJob,
        kb: Knowledgebase,
        maps: KnowledgeWikiJob[],
        row: KnowledgeWikiSourceMapResult,
        fingerprint: string,
        target: KnowledgeWikiPage | undefined,
        decision: KnowledgeWikiIdentityDecision
    ) {
        return this.dataSource.transaction(async (manager) => {
            const currentKb = await manager.getRepository(Knowledgebase).findOne({
                where: { id: kb.id, tenantId: kb.tenantId, organizationId: kb.organizationId },
                lock: { mode: 'pessimistic_write' }
            })
            if (
                !currentKb ||
                hashKnowledgeWikiValue([currentKb.wikiConfig, currentKb.wikiModelId, currentKb.chatModelId]) !==
                    hashKnowledgeWikiValue([kb.wikiConfig, kb.wikiModelId, kb.chatModelId])
            ) {
                throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
            }
            const worker = await manager.getRepository(KnowledgeWikiJob).findOne({
                where: {
                    id: job.id,
                    executionAttempt: job.executionAttempt,
                    generationAttempt: job.generationAttempt,
                    isCurrent: true,
                    status: 'running'
                }
            })
            if (!worker) throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
            const source = maps.find((map) => map.id === row.sourceJobId)
            if (!source) throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
            await this.assertSources(manager, [source], true)
            const pages = manager.getRepository(KnowledgeWikiPage)
            const catalogue = await pages.find({
                where: { knowledgebaseId: kb.id, pageType: row.pageType },
                select: { id: true, identityRevision: true },
                order: { id: 'ASC' }
            })
            if (this.catalogueFingerprint(catalogue) !== fingerprint) return false
            const results = manager.getRepository(KnowledgeWikiSourceMapResult)
            const current = await results.findOne({ where: { id: row.id, sourceJobId: row.sourceJobId } })
            if (!current) throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
            if (current.normalizedPageKey) return true
            let page = target
                ? await pages.findOne({ where: { id: target.id, knowledgebaseId: kb.id, pageType: row.pageType } })
                : undefined
            if (!page) {
                const id = uuidv5(
                    `wiki:${kb.id}:${row.pageType === 'summary' ? `summary:${row.sourceDocumentIdSnapshot}` : row.id}`,
                    uuidv5.URL
                )
                const identity = createKnowledgeWikiResolvedPageIdentity(
                    row.pageType,
                    row.canonicalName,
                    row.sourceDocumentIdSnapshot,
                    id
                )
                page = await pages.save(
                    pages.create({
                        id,
                        tenantId: kb.tenantId,
                        organizationId: kb.organizationId,
                        knowledgebaseId: kb.id,
                        ...identity,
                        pageType: row.pageType,
                        canonicalName: row.canonicalName,
                        identity: {
                            descriptor: row.identity,
                            aliases: [...new Set([row.canonicalName, ...row.payload.aliases])],
                            embedding: row.identityEmbedding ?? null
                        },
                        identityRevision: 1,
                        status: 'building',
                        projectionStatus: 'pending',
                        sourceCount: 0,
                        inboundLinkCount: 0,
                        outboundLinkCount: 0
                    })
                )
            } else if (page.identity) {
                const descriptor = page.identity.descriptor
                const identity: KnowledgeWikiIdentityProfile = {
                    ...page.identity,
                    aliases: [...new Set([...page.identity.aliases, row.canonicalName, ...row.payload.aliases])]
                }
                if (descriptor.kind === 'entity' && row.identity.kind === 'entity') {
                    if (!canMatchWikiIdentity(row.identity, descriptor))
                        throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
                    const identifiers = new Map(
                        [...descriptor.identifiers, ...row.identity.identifiers].map((item) => [item.namespace, item])
                    )
                    identity.descriptor = {
                        ...descriptor,
                        entityType:
                            descriptor.entityType === 'unknown' ? row.identity.entityType : descriptor.entityType,
                        identifiers: [...identifiers.values()]
                    }
                }
                await pages.update(page.id, {
                    identity,
                    identityRevision: page.identityRevision + 1,
                    version: () => '"version"'
                })
            }
            await results.update(row.id, { normalizedPageKey: page.pageKey, identityDecision: decision })
            row.normalizedPageKey = page.pageKey
            row.identityDecision = decision
            return true
        })
    }
}
