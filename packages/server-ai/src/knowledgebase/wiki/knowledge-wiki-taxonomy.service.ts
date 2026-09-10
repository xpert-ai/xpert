// Invariants: taxonomy creation uses the classification outbox and model ledger.
// Directory creation and placements commit together after rechecking manual edits and page versions.
import { Injectable } from '@nestjs/common'
import { EntityManager, In } from 'typeorm'
import { v5 as uuidv5 } from 'uuid'
import { RequestContext } from '@xpert-ai/server-core'
import {
    normalizeKnowledgebaseWikiConfig,
    KnowledgeWikiTaxonomyClassificationInput,
    KnowledgeWikiPendingPublication
} from '@xpert-ai/contracts'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPageVersion } from './entities'
import { KnowledgeWikiFolder, KnowledgeWikiPlacement } from './entities/knowledge-wiki-organization.entity'
import { enqueueWikiPageClassification } from './knowledge-wiki-classification.outbox'
import { KnowledgeWikiOrganizationService } from './knowledge-wiki-organization.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { visibleWikiPages, wikiPageRows } from './knowledge-wiki-browse.service'
import {
    createKnowledgeWikiConfigFingerprint,
    KNOWLEDGE_WIKI_GENERATOR_VERSION,
    resolveKnowledgeWikiModel
} from './knowledge-wiki-config'

type WikiRows = Awaited<ReturnType<typeof wikiPageRows>>

@Injectable()
export class KnowledgeWikiTaxonomyService {
    constructor(
        private readonly organization: KnowledgeWikiOrganizationService,
        private readonly models: KnowledgeWikiModelInvocationService
    ) {}

    async active(manager: EntityManager, id: string, revision: number) {
        return manager
            .getRepository(KnowledgeWikiJob)
            .createQueryBuilder('job')
            .where('job."knowledgebaseId" = :id AND job.type = :type AND job."isCurrent" = true', {
                id,
                type: 'classify'
            })
            .andWhere(
                "job.classification ->> 'mode' = 'taxonomy' AND job.classification ->> 'taxonomyRevision' = :revision",
                { revision: String(revision) }
            )
            .andWhere('job.status IN (:...statuses)', { statuses: ['queued', 'running'] })
            .getOne()
    }

    // The caller holds the knowledgebase lock, shared with publication and taxonomy completion.
    async enqueuePublished(manager: EntityManager, kb: Knowledgebase, publications: KnowledgeWikiPendingPublication[]) {
        if (!publications.length) return
        const rows = await wikiPageRows(
            visibleWikiPages(manager, kb).andWhere('page.id IN (:...ids)', {
                ids: publications.map((page) => page.pageId)
            })
        )
        const byId = new Map(rows.map((row) => [row.id, row]))
        const pages = publications.flatMap((publication) => {
            const row = byId.get(publication.pageId)
            return row &&
                row.pageType !== 'index' &&
                row.activeVersionId === publication.pageVersionId &&
                row.placementSource !== 'manual'
                ? [{ publication, row }]
                : []
        })
        if (!pages.length) return
        const config = await this.organization.taxonomy(manager, kb)
        if (await manager.getRepository(KnowledgeWikiFolder).existsBy({ knowledgebaseId: kb.id })) {
            for (const { publication, row } of pages)
                await enqueueWikiPageClassification(
                    manager,
                    kb,
                    {
                        runId: publication.runId,
                        pageId: publication.pageId,
                        pageVersionId: publication.pageVersionId,
                        taxonomyRevision: config.revision,
                        placementVersion: row.placementVersion ?? 0,
                        applyAutomatically: true,
                        trigger: 'publication'
                    },
                    publication.billingPrincipalId
                )
            return
        }
        const active = await this.active(manager, kb.id, config.revision)
        if (active?.classification?.mode === 'taxonomy') {
            const input = active.classification
            const pending = new Map((input.pendingPublications ?? []).map((page) => [page.pageId, page]))
            for (const { publication } of pages)
                if (
                    !input.pages.some(
                        (page) => page.pageId === publication.pageId && page.pageVersionId === publication.pageVersionId
                    )
                )
                    pending.set(publication.pageId, publication)
            await manager.getRepository(KnowledgeWikiJob).update(active.id, {
                classification: { ...input, pendingPublications: [...pending.values()] }
            })
            return
        }
        const first = pages[0].publication
        await this.enqueue(
            manager,
            kb,
            config.revision,
            pages.slice(0, 100).map((page) => page.row),
            first.runId,
            first.billingPrincipalId,
            pages.slice(100).map((page) => page.publication)
        )
    }

    async enqueue(
        manager: EntityManager,
        kb: Knowledgebase,
        revision: number,
        pages: WikiRows,
        runId: string,
        billingPrincipalId = RequestContext.currentUserId(),
        pendingPublications: KnowledgeWikiPendingPublication[] = []
    ) {
        const jobKey = `taxonomy:${runId}:${revision}:${pages[0].id}:${pages[0].activeVersionId}:${pages[0].placementVersion ?? 0}`
        const classification: KnowledgeWikiTaxonomyClassificationInput = {
            mode: 'taxonomy',
            runId,
            taxonomyRevision: revision,
            pendingPublications,
            pages: pages.map((page) => ({
                pageId: page.id,
                pageVersionId: page.activeVersionId,
                placementVersion: page.placementVersion ?? 0
            }))
        }
        await manager.getRepository(KnowledgeWikiJob).insert({
            id: uuidv5(`${kb.id}:${jobKey}`, uuidv5.URL),
            jobKey,
            knowledgebaseId: kb.id,
            tenantId: kb.tenantId,
            organizationId: kb.organizationId,
            type: 'classify',
            isCurrent: true,
            status: 'queued',
            generationRevision: kb.wikiActiveRevision ?? 0,
            generationAttempt: 0,
            executionAttempt: 0,
            billingPrincipalId,
            configFingerprint: createKnowledgeWikiConfigFingerprint(kb.wikiConfig, resolveKnowledgeWikiModel(kb)),
            generatorVersion: KNOWLEDGE_WIKI_GENERATOR_VERSION,
            dispatchAfter: new Date(),
            dispatchAttempts: 0,
            spendEnvelope: { maxModelInvocations: 2, maxEstimatedTokens: 200000 },
            classification
        })
    }

    async process(job: KnowledgeWikiJob, input: KnowledgeWikiTaxonomyClassificationInput) {
        const snapshot = await this.organization.dataSource.transaction('REPEATABLE READ', async (manager) => {
            const kb = await manager
                .getRepository(Knowledgebase)
                .findOneOrFail({ where: { id: job.knowledgebaseId }, relations: ['wikiModel', 'chatModel'] })
            if (!(await this.current(manager, kb, job, input))) return null
            const pages = this.eligible(
                await wikiPageRows(
                    visibleWikiPages(manager, kb).andWhere('page.id IN (:...ids)', {
                        ids: input.pages.map((page) => page.pageId)
                    })
                ),
                input
            )
            if (!pages.length) return null
            const versions = await manager
                .getRepository(KnowledgeWikiPageVersion)
                .findBy({ knowledgebaseId: kb.id, id: In(pages.map((page) => page.activeVersionId)) })
            return {
                kb,
                modelInput: {
                    pages: pages.map((page) => ({
                        id: page.id,
                        title: page.title,
                        summary: page.summary.slice(0, 700),
                        content: versions
                            .find((version) => version.id === page.activeVersionId)
                            .contentMarkdown.slice(0, 1200)
                    }))
                }
            }
        })
        if (!snapshot) return this.stale(this.organization.dataSource.manager, job)
        const result = await this.models.invokeTaxonomyModel(job, snapshot.kb, snapshot.modelInput)
        await this.organization.dataSource.transaction(async (manager) => {
            await this.organization.lock(manager, job.knowledgebaseId)
            const kb = await manager
                .getRepository(Knowledgebase)
                .findOneOrFail({ where: { id: job.knowledgebaseId }, relations: ['wikiModel', 'chatModel'] })
            const jobs = manager.getRepository(KnowledgeWikiJob)
            const owned = await jobs.findOne({
                where: { id: job.id, status: 'running', isCurrent: true, executionAttempt: job.executionAttempt },
                lock: { mode: 'pessimistic_write' }
            })
            if (!owned) return
            if (!(await this.current(manager, kb, job, input))) return this.stale(manager, job)
            const eligible = new Map(
                this.eligible(
                    await wikiPageRows(
                        visibleWikiPages(manager, kb).andWhere('page.id IN (:...ids)', {
                            ids: input.pages.map((page) => page.pageId)
                        })
                    ),
                    input
                ).map((page) => [page.id, page])
            )
            const modeled = new Set(snapshot.modelInput.pages.map((page) => page.id))
            const placements = new Map<string, { folderId: string | null; reason: string }>()
            const folders = manager.getRepository(KnowledgeWikiFolder)
            let position = 0
            for (const group of result.folders) {
                const ids = group.pageIds.filter((id) => eligible.has(id) && modeled.has(id))
                if (!ids.length) continue
                const folder = await folders.save(
                    folders.create({
                        knowledgebaseId: kb.id,
                        tenantId: kb.tenantId,
                        organizationId: kb.organizationId,
                        parentId: null,
                        name: group.name,
                        description: group.description,
                        position: position++,
                        version: 1
                    })
                )
                for (const id of ids) placements.set(id, { folderId: folder.id, reason: group.description })
            }
            for (const id of result.unclassifiedPageIds)
                if (eligible.has(id) && modeled.has(id)) placements.set(id, { folderId: null, reason: '' })
            const config = await this.organization.taxonomy(manager, kb)
            if (position) {
                config.revision++
                await manager.save(config)
            }
            const results: NonNullable<KnowledgeWikiTaxonomyClassificationInput['results']> = []
            for (const page of input.pages) {
                const result = placements.get(page.pageId)
                if (!result) {
                    results.push({ pageId: page.pageId, result: { folderId: null, reason: '' }, outcome: 'stale' })
                    continue
                }
                const repo = manager.getRepository(KnowledgeWikiPlacement)
                const placement =
                    (await repo.findOneBy({ knowledgebaseId: kb.id, pageId: page.pageId })) ??
                    repo.create({
                        knowledgebaseId: kb.id,
                        tenantId: kb.tenantId,
                        organizationId: kb.organizationId,
                        pageId: page.pageId
                    })
                Object.assign(placement, {
                    folderId: result.folderId,
                    source: 'automatic',
                    version: page.placementVersion + 1
                })
                await repo.save(placement)
                results.push({ pageId: page.pageId, result, outcome: result.folderId ? 'applied' : 'unclassified' })
            }
            const pending =
                owned.classification?.mode === 'taxonomy' ? (owned.classification.pendingPublications ?? []) : []
            await jobs.update(job.id, {
                classification: {
                    ...input,
                    pendingPublications: [],
                    appliedTaxonomyRevision: config.revision,
                    results
                },
                status: 'succeeded',
                completedAt: new Date(),
                lockedAt: null,
                leaseExpiresAt: null
            })
            await this.enqueuePublished(manager, kb, pending)
        })
    }

    private eligible(pages: WikiRows, input: KnowledgeWikiTaxonomyClassificationInput) {
        const snapshots = new Map(input.pages.map((page) => [page.pageId, page]))
        return pages.filter((page) => {
            const snapshot = snapshots.get(page.id)
            return (
                snapshot &&
                page.pageType !== 'index' &&
                page.activeVersionId === snapshot.pageVersionId &&
                page.placementSource !== 'manual' &&
                (page.placementVersion ?? 0) === snapshot.placementVersion
            )
        })
    }

    private async current(
        manager: EntityManager,
        kb: Knowledgebase,
        job: KnowledgeWikiJob,
        input: KnowledgeWikiTaxonomyClassificationInput
    ) {
        if (
            !normalizeKnowledgebaseWikiConfig(kb.wikiConfig).enabled ||
            createKnowledgeWikiConfigFingerprint(kb.wikiConfig, resolveKnowledgeWikiModel(kb)) !== job.configFingerprint
        )
            return false
        const config = await this.organization.taxonomy(manager, kb)
        return (
            config.revision === input.taxonomyRevision &&
            !(await manager.getRepository(KnowledgeWikiFolder).existsBy({ knowledgebaseId: kb.id }))
        )
    }

    private stale(manager: EntityManager, job: KnowledgeWikiJob) {
        return manager
            .getRepository(KnowledgeWikiJob)
            .update(
                { id: job.id, status: 'running', executionAttempt: job.executionAttempt },
                { status: 'stale', isCurrent: false, completedAt: new Date(), lockedAt: null, leaseExpiresAt: null }
            )
    }
}
