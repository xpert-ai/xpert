import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { In, Repository } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import {
    KnowledgeWikiJob,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiPageEvidenceEntity,
    KnowledgeWikiPageReduceInput,
    KnowledgeWikiPageReduceInputSource,
    KnowledgeWikiPageVersion,
    KnowledgeWikiSourceMapResult,
    KnowledgeWikiSourceState
} from './entities'
import { KnowledgeWikiPageSourcePayload } from '@xpert-ai/contracts'
import {
    hashKnowledgeWikiValue,
    isEligibleKnowledgeWikiSource,
    orderKnowledgeWikiSourceChunks
} from './knowledge-wiki-generation.utils'
import { mergeResolvedWikiContributions } from './knowledge-wiki-dedup'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiJobFenceService } from './knowledge-wiki-job-fence.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { KnowledgeWikiError } from './knowledge-wiki-error'

// Invariants: reduce only eligible source generations and retain their evidence.
// Generated versions remain staged here; only finalization changes the active page version.
// Version reuse is scoped to the producer job and generation attempt.
@Injectable()
export class KnowledgeWikiPageReduceService {
    constructor(
        @InjectRepository(KnowledgeDocument) private readonly documentRepository: Repository<KnowledgeDocument>,
        @InjectRepository(KnowledgeWikiJob) private readonly jobRepository: Repository<KnowledgeWikiJob>,
        @InjectRepository(KnowledgeWikiSourceState)
        private readonly sourceStateRepository: Repository<KnowledgeWikiSourceState>,
        @InjectRepository(KnowledgeWikiSourceMapResult)
        private readonly mapResultRepository: Repository<KnowledgeWikiSourceMapResult>,
        @InjectRepository(KnowledgeWikiPage) private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiPageVersion)
        private readonly pageVersionRepository: Repository<KnowledgeWikiPageVersion>,
        @InjectRepository(KnowledgeWikiPageContribution)
        private readonly contributionRepository: Repository<KnowledgeWikiPageContribution>,
        @InjectRepository(KnowledgeWikiPageEvidenceEntity)
        private readonly evidenceRepository: Repository<KnowledgeWikiPageEvidenceEntity>,
        @InjectRepository(KnowledgeWikiPageReduceInput)
        private readonly reduceInputRepository: Repository<KnowledgeWikiPageReduceInput>,
        @InjectRepository(KnowledgeWikiPageReduceInputSource)
        private readonly reduceInputSourceRepository: Repository<KnowledgeWikiPageReduceInputSource>,
        private readonly jobFence: KnowledgeWikiJobFenceService,
        private readonly dispatcher: KnowledgeWikiJobDispatcherService,
        private readonly modelInvocationService: KnowledgeWikiModelInvocationService
    ) {}

    async process(job: KnowledgeWikiJob) {
        const knowledgebase = await this.jobFence.assert(job)
        if (!job.pageKey) {
            throw new Error(
                t('server-ai:Error.KnowledgebaseWikiReduceJobPageKeyRequired', {
                    defaultValue: 'Wiki reduce job is missing its page key'
                })
            )
        }
        const rebuildRoot = job.parentJobId
            ? await this.jobRepository.findOne({ where: { id: job.parentJobId, type: 'rebuild', isCurrent: true } })
            : null
        const rebuildSourceJobs = rebuildRoot
            ? await this.jobRepository.find({
                  where: { parentJobId: rebuildRoot.id, type: 'source_map', isCurrent: true, status: 'succeeded' }
              })
            : []
        const mapResults = rebuildRoot
            ? rebuildSourceJobs.length
                ? await this.mapResultRepository.find({
                      where: {
                          sourceJobId: In(rebuildSourceJobs.map((sourceJob) => sourceJob.id)),
                          normalizedPageKey: job.pageKey
                      }
                  })
                : []
            : await this.mapResultRepository.find({
                  where: { sourceJobId: job.parentJobId, normalizedPageKey: job.pageKey }
              })
        const page = await this.pageRepository.findOne({
            where: { knowledgebaseId: knowledgebase.id, pageKey: job.pageKey }
        })
        if (!page) {
            if (mapResults.length) throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
            await this.dispatcher.markSucceeded(job.id)
            return
        }
        const sources = await this.prepareReduceSources(job, page, mapResults, !!rebuildRoot)
        if (!sources.length) {
            await this.dispatcher.markSucceeded(job.id)
            return
        }
        const inputFingerprint = hashKnowledgeWikiValue(
            sources.map((source) => ({
                sourceDocumentId: source.document.id,
                contentHash: source.document.contentHash,
                payload: source.payload
            }))
        )
        let reduceInput = await this.reduceInputRepository.findOne({
            where: { stageJobId: job.id, generationAttempt: job.generationAttempt }
        })
        if (reduceInput && reduceInput.inputFingerprint !== inputFingerprint) {
            const result = await this.jobRepository.update(
                {
                    id: job.id,
                    executionAttempt: job.executionAttempt,
                    generationAttempt: job.generationAttempt,
                    status: 'running',
                    isCurrent: true
                },
                { generationAttempt: job.generationAttempt + 1 }
            )
            if (!result.affected) throw new KnowledgeWikiError('knowledge_wiki_publication_conflict', page.id)
            reduceInput.status = 'stale'
            await this.reduceInputRepository.save(reduceInput)
            job.generationAttempt += 1
            reduceInput = null
        }
        if (!reduceInput) {
            reduceInput = await this.reduceInputRepository.save(
                this.reduceInputRepository.create({
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    pageId: page.id,
                    rootJobId: job.rootJobId ?? job.id,
                    stageJobId: job.id,
                    generationAttempt: job.generationAttempt,
                    generationRevision: job.generationRevision,
                    configFingerprint: job.configFingerprint,
                    generatorVersion: job.generatorVersion,
                    expectedPageVersion: page.version,
                    inputFingerprint,
                    status: 'prepared'
                })
            )
            await this.reduceInputSourceRepository.save(
                sources.map((source) =>
                    this.reduceInputSourceRepository.create({
                        tenantId: knowledgebase.tenantId,
                        organizationId: knowledgebase.organizationId,
                        inputId: reduceInput.id,
                        knowledgebaseId: knowledgebase.id,
                        sourceDocumentIdSnapshot: source.document.id,
                        sourceLifecycleGeneration: source.lifecycleGeneration,
                        sourcePublicationEpoch: source.document.publicationEpoch ?? 0,
                        sourceContentHash: source.document.contentHash,
                        payload: source.payload,
                        evidence: source.evidence
                    })
                )
            )
        }
        // Same sources mean the cached generation is still valid despite a changed page counter.
        reduceInput.expectedPageVersion = page.version
        reduceInput.status = 'running'
        await this.reduceInputRepository.save(reduceInput)
        const output = await this.modelInvocationService.invokeReduceModel(
            job,
            knowledgebase,
            page,
            sources,
            inputFingerprint
        )
        let version = await this.pageVersionRepository.findOne({
            where: { pageId: page.id, producerJobId: job.id, generationAttempt: job.generationAttempt }
        })
        if (version && version.status !== 'ready' && version.expectedPageVersion !== reduceInput.expectedPageVersion) {
            version.expectedPageVersion = reduceInput.expectedPageVersion
            await this.pageVersionRepository.save(version)
        }
        if (!version) {
            version = await this.pageVersionRepository.save(
                this.pageVersionRepository.create({
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    pageId: page.id,
                    producerJobId: job.id,
                    generationAttempt: job.generationAttempt,
                    generationRevision: job.generationRevision,
                    generatorVersion: job.generatorVersion,
                    configFingerprint: job.configFingerprint,
                    expectedPageVersion: reduceInput.expectedPageVersion,
                    title: output.title,
                    summary: output.summary,
                    contentMarkdown: output.contentMarkdown,
                    aliases: [
                        ...new Set(
                            sources.flatMap((source) => [source.payload.canonicalName, ...source.payload.aliases])
                        )
                    ].filter((name) => name !== page.canonicalName),
                    contentHash: hashKnowledgeWikiValue(output),
                    status: 'building',
                    projectionStatus: 'pending'
                })
            )
            await this.contributionRepository.save(
                sources.map((source) =>
                    this.contributionRepository.create({
                        tenantId: knowledgebase.tenantId,
                        organizationId: knowledgebase.organizationId,
                        knowledgebaseId: knowledgebase.id,
                        pageId: page.id,
                        pageVersionId: version.id,
                        sourceDocumentIdSnapshot: source.document.id,
                        sourceLifecycleGeneration: source.lifecycleGeneration,
                        sourceContentHash: source.document.contentHash,
                        wikiRevision: job.generationRevision,
                        generatorVersion: job.generatorVersion,
                        payload: source.payload
                    })
                )
            )
            const evidenceRows = sources.flatMap((source) =>
                source.evidence.map((evidence) =>
                    this.evidenceRepository.create({
                        tenantId: knowledgebase.tenantId,
                        organizationId: knowledgebase.organizationId,
                        knowledgebaseId: knowledgebase.id,
                        pageId: page.id,
                        pageVersionId: version.id,
                        sourceDocumentIdSnapshot: source.document.id,
                        sourceChunkIdSnapshot: evidence.sourceChunkId,
                        quote: evidence.quote,
                        ordinal: evidence.ordinal,
                        sectionAnchor: evidence.sectionAnchor,
                        sourceContentHash: source.document.contentHash
                    })
                )
            )
            if (evidenceRows.length) await this.evidenceRepository.save(evidenceRows)
        }
        reduceInput.status = 'succeeded'
        reduceInput.completedAt = new Date()
        await this.reduceInputRepository.save(reduceInput)
        await this.dispatcher.markSucceeded(job.id)
    }

    private async prepareReduceSources(
        job: KnowledgeWikiJob,
        page: KnowledgeWikiPage,
        mapResults: KnowledgeWikiSourceMapResult[],
        fullRebuild: boolean
    ) {
        const payloads = new Map<string, { payload: KnowledgeWikiPageSourcePayload; lifecycleGeneration: number }>()
        if (!fullRebuild && page.activeVersionId) {
            const existing = await this.contributionRepository.find({ where: { pageVersionId: page.activeVersionId } })
            for (const contribution of existing) {
                if (contribution.sourceDocumentIdSnapshot !== job.sourceDocumentIdSnapshot) {
                    payloads.set(contribution.sourceDocumentIdSnapshot, {
                        payload: contribution.payload,
                        lifecycleGeneration: contribution.sourceLifecycleGeneration
                    })
                }
            }
        }
        const incoming = new Map<string, KnowledgeWikiSourceMapResult[]>()
        for (const result of mapResults) {
            const items = incoming.get(result.sourceDocumentIdSnapshot) ?? []
            items.push(result)
            incoming.set(result.sourceDocumentIdSnapshot, items)
        }
        for (const [documentId, results] of incoming) {
            results.sort((a, b) => (a.candidateKey ?? '').localeCompare(b.candidateKey ?? ''))
            payloads.set(documentId, {
                payload: mergeResolvedWikiContributions(results.map((result) => result.payload)),
                lifecycleGeneration: results[0].sourceLifecycleGeneration
            })
        }
        const documentIds = [...payloads.keys()]
        if (!documentIds.length) return []
        const documents = await this.documentRepository.find({
            where: { id: In(documentIds), knowledgebaseId: job.knowledgebaseId },
            relations: ['chunks']
        })
        const states = await this.sourceStateRepository.find({
            where: { knowledgebaseId: job.knowledgebaseId, sourceDocumentIdSnapshot: In(documentIds), eligible: true }
        })
        const statesByDocument = new Map(states.map((state) => [state.sourceDocumentIdSnapshot, state]))
        return documents.flatMap((document) => {
            const configured = payloads.get(document.id)
            const state = statesByDocument.get(document.id)
            if (
                !configured ||
                !state ||
                state.lifecycleGeneration !== configured.lifecycleGeneration ||
                state.lastContentHash !== document.contentHash ||
                !isEligibleKnowledgeWikiSource(document)
            ) {
                return []
            }
            const chunks = orderKnowledgeWikiSourceChunks(document.chunks ?? [])
            const evidence = chunks.flatMap((chunk) =>
                configured.payload.facts.flatMap((fact, factIndex) => {
                    if (!chunk.pageContent || !fact.sourceChunkIds.includes(chunk.id)) return []
                    return [
                        {
                            sourceChunkId: chunk.id,
                            quote: chunk.pageContent,
                            ordinal: factIndex,
                            sectionAnchor: `fact-${factIndex + 1}`
                        }
                    ]
                })
            )
            if (!evidence.length) return []
            return [
                {
                    document,
                    payload: configured.payload,
                    lifecycleGeneration: state.lifecycleGeneration,
                    evidence
                }
            ]
        })
    }
}
