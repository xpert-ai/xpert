// Invariants: shared identity resolution never writes article content. Wiki owns page creation,
// source-generation fences, model invocation accounting, and subsequent Reduce scheduling.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { KnowledgeWikiIdentityDecision } from '@xpert-ai/contracts'
import { DataSource, EntityManager, In, Repository } from 'typeorm'
import { v5 as uuidv5 } from 'uuid'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeIdentityError } from '../identity/knowledge-identity-error'
import { KnowledgeIdentityService } from '../identity/knowledge-identity.service'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiSourceMapResult, KnowledgeWikiSourceState } from './entities'
import { parseWikiIdentityDescriptor } from './knowledge-wiki-dedup-model'
import { KnowledgeWikiError } from './knowledge-wiki-error'
import { hashKnowledgeWikiValue, isEligibleKnowledgeWikiSource } from './knowledge-wiki-generation.utils'
import { createKnowledgeWikiResolvedPageIdentity } from './knowledge-wiki-identity'
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
        private readonly dataSource: DataSource,
        private readonly fence: KnowledgeWikiJobFenceService,
        private readonly identities: KnowledgeIdentityService,
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
        for (const map of maps) {
            const sourceRows = rows.filter((row) => row.sourceJobId === map.id)
            for (const row of sourceRows) {
                row.identity = parseWikiIdentityDescriptor(row.identity)
                if (row.identity.kind !== row.pageType) throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
            }
            if (sourceRows.length && sourceRows.every((row) => row.normalizedPageKey)) continue
            await this.fence.assert(job)
            const candidates = sourceRows.flatMap((row) =>
                row.identity.kind === 'summary'
                    ? []
                    : [
                          {
                              candidateKey: row.candidateKey,
                              canonicalName: row.canonicalName,
                              aliases: row.payload.aliases,
                              descriptor: row.identity,
                              facts: row.payload.facts,
                              embedding: row.identityEmbedding
                          }
                      ]
            )
            try {
                const observations = await this.identities.resolveBatch(
                    {
                        knowledgebaseId: kb.id,
                        tenantId: kb.tenantId,
                        organizationId: kb.organizationId,
                        sourceDocumentIdSnapshot: map.sourceDocumentIdSnapshot,
                        sourceContentHash: map.sourceContentHash,
                        sourcePublicationEpoch: map.sourcePublicationEpoch ?? 0,
                        consumer: 'wiki',
                        extractionId: uuidv5(`wiki-identity-extraction:${map.id}:${map.generationAttempt}`, uuidv5.URL)
                    },
                    candidates,
                    {
                        judge: (input, ordinal) =>
                            this.model.invokeDedupModel(
                                job,
                                kb,
                                input,
                                rows.findIndex(
                                    (row) =>
                                        row.sourceJobId === map.id &&
                                        row.candidateKey === candidates[ordinal].candidateKey
                                )
                            ),
                        assertCurrent: (manager) => this.assertCurrent(manager, job, kb, map)
                    }
                )
                const resolved = new Map(observations.map((observation) => [observation.candidateKey, observation]))
                for (const row of sourceRows) {
                    if (row.normalizedPageKey) continue
                    const observation = resolved.get(row.candidateKey)
                    if (row.identity.kind !== 'summary' && !observation)
                        throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
                    await this.savePage(
                        job,
                        kb,
                        map,
                        row,
                        observation?.identityId ?? null,
                        observation?.decision ?? {
                            outcome: 'source',
                            reason: 'Summary identity belongs to its source document.',
                            comparedIdentityIds: []
                        }
                    )
                }
            } catch (error) {
                if (!(error instanceof KnowledgeIdentityError) || error.code !== 'busy') throw error
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

    private async assertCurrent(
        manager: EntityManager,
        job: KnowledgeWikiJob,
        kb: Knowledgebase,
        map: KnowledgeWikiJob
    ) {
        const currentKb = await manager.getRepository(Knowledgebase).findOne({
            where: { id: kb.id, tenantId: kb.tenantId, organizationId: kb.organizationId },
            lock: { mode: 'pessimistic_write' }
        })
        if (
            !currentKb ||
            hashKnowledgeWikiValue([currentKb.wikiConfig, currentKb.wikiModelId, currentKb.chatModelId]) !==
                hashKnowledgeWikiValue([kb.wikiConfig, kb.wikiModelId, kb.chatModelId])
        )
            throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
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
        await this.assertSources(manager, [map], true)
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

    private async savePage(
        job: KnowledgeWikiJob,
        kb: Knowledgebase,
        map: KnowledgeWikiJob,
        row: KnowledgeWikiSourceMapResult,
        identityId: string | null,
        decision: KnowledgeWikiIdentityDecision
    ) {
        await this.dataSource.transaction(async (manager) => {
            await this.assertCurrent(manager, job, kb, map)
            const results = manager.getRepository(KnowledgeWikiSourceMapResult)
            const current = await results.findOne({ where: { id: row.id, sourceJobId: row.sourceJobId } })
            if (!current) throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
            if (current.normalizedPageKey) return
            const pages = manager.getRepository(KnowledgeWikiPage)
            const id = uuidv5(`wiki:${kb.id}:${identityId ?? `summary:${row.sourceDocumentIdSnapshot}`}`, uuidv5.URL)
            let page = await pages.findOne({
                where: {
                    knowledgebaseId: kb.id,
                    ...(identityId ? { identityId } : { pageKey: `summary:${row.sourceDocumentIdSnapshot}` })
                }
            })
            if (!page) {
                page = await pages.save(
                    pages.create({
                        id,
                        tenantId: kb.tenantId,
                        organizationId: kb.organizationId,
                        knowledgebaseId: kb.id,
                        ...createKnowledgeWikiResolvedPageIdentity(
                            row.pageType,
                            row.canonicalName,
                            row.sourceDocumentIdSnapshot,
                            id
                        ),
                        pageType: row.pageType,
                        canonicalName: row.canonicalName,
                        identityId,
                        status: 'building',
                        projectionStatus: 'pending',
                        sourceCount: 0,
                        inboundLinkCount: 0,
                        outboundLinkCount: 0
                    })
                )
            }
            await results.update(row.id, { normalizedPageKey: page.pageKey, identityId, identityDecision: decision })
            row.normalizedPageKey = page.pageKey
            row.identityId = identityId
            row.identityDecision = decision
        })
    }
}
