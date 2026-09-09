// Invariants: classification runs after publication and has independent failure/placement state.
// Persist the outbox in the publishing transaction; all writes recheck page, taxonomy and placement versions.
import { Injectable } from '@nestjs/common'
import { EntityManager, In } from 'typeorm'
import { randomUUID } from 'node:crypto'
import type { KnowledgeWikiClassificationItem, KnowledgeWikiClassificationStatus } from '@xpert-ai/contracts'
import { normalizeKnowledgebaseWikiConfig } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiFolder, KnowledgeWikiPlacement } from './entities/knowledge-wiki-organization.entity'
import { KnowledgeWikiJob, KnowledgeWikiModelInvocation, KnowledgeWikiPage, KnowledgeWikiPageVersion } from './entities'
import { KnowledgeWikiOrganizationService } from './knowledge-wiki-organization.service'
import { visibleWikiPages, wikiPageRows } from './knowledge-wiki-browse.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { createKnowledgeWikiConfigFingerprint, resolveKnowledgeWikiModel } from './knowledge-wiki-config'
import { wikiOrganizationError } from './knowledge-wiki-organization.utils'
import { enqueueWikiPageClassification } from './knowledge-wiki-classification.outbox'
import { KnowledgeWikiTaxonomyService } from './knowledge-wiki-taxonomy.service'

@Injectable()
export class KnowledgeWikiClassificationService {
    constructor(
        private readonly organization: KnowledgeWikiOrganizationService,
        private readonly models: KnowledgeWikiModelInvocationService,
        private readonly taxonomyBuilder: KnowledgeWikiTaxonomyService
    ) {}

    async enqueuePublished(
        manager: EntityManager,
        kb: Knowledgebase,
        parent: KnowledgeWikiJob,
        candidates: Array<{ page: KnowledgeWikiPage; version: KnowledgeWikiPageVersion | null }>
    ) {
        const full = await manager.getRepository(Knowledgebase).findOneOrFail({
            where: { id: kb.id },
            relations: ['wikiModel', 'chatModel']
        })
        if (!normalizeKnowledgebaseWikiConfig(full.wikiConfig).enabled) return
        await this.taxonomyBuilder.enqueuePublished(
            manager,
            full,
            candidates.flatMap(({ page, version }) =>
                version && page.pageType !== 'index'
                    ? [
                          {
                              pageId: page.id,
                              pageVersionId: version.id,
                              runId: parent.id,
                              billingPrincipalId: parent.billingPrincipalId
                          }
                      ]
                    : []
            )
        )
    }

    private async enqueue(
        manager: EntityManager,
        kb: Knowledgebase,
        pageId: string,
        pageVersionId: string,
        revision: number,
        userId: string,
        runId: string,
        trigger: 'publication' | 'backfill'
    ) {
        const placement = await manager
            .getRepository(KnowledgeWikiPlacement)
            .findOneBy({ knowledgebaseId: kb.id, pageId })
        if (placement?.source === 'manual') return
        await enqueueWikiPageClassification(
            manager,
            kb,
            {
                runId,
                pageId,
                pageVersionId,
                taxonomyRevision: revision,
                placementVersion: placement?.version ?? 0,
                applyAutomatically: true,
                trigger
            },
            userId
        )
    }

    async start(id: string, unclassifiedOnly: boolean) {
        await this.organization.authorize(id, true)
        const runId = randomUUID()
        return this.organization.dataSource.transaction(async (manager) => {
            const kb = await this.organization.lock(manager, id)
            const full = await manager
                .getRepository(Knowledgebase)
                .findOneOrFail({ where: { id }, relations: ['wikiModel', 'chatModel'] })
            const taxonomy = await this.organization.taxonomy(manager, kb)
            const hasFolders = await manager.getRepository(KnowledgeWikiFolder).existsBy({ knowledgebaseId: id })
            if (!hasFolders) {
                const active = await this.taxonomyBuilder.active(manager, id, taxonomy.revision)
                if (active?.classification?.mode === 'taxonomy')
                    return {
                        runId: active.classification.runId,
                        count: active.classification.pages.length,
                        truncated: false
                    }
            }
            const query = visibleWikiPages(manager, kb).andWhere(
                "page.\"pageType\" <> 'index' AND (placement.source IS NULL OR placement.source <> 'manual')"
            )
            // Repeated backfill advances beyond the first batch, including pages with no matching directory.
            query.andWhere(
                `NOT EXISTS (SELECT 1 FROM knowledge_wiki_job j
                WHERE j."knowledgebaseId" = page."knowledgebaseId" AND j.type = 'classify' AND j."isCurrent" = true
                AND j.classification ->> 'pageId' = page.id::text
                AND j.classification ->> 'pageVersionId' = page."activeVersionId"::text
                AND j.classification ->> 'taxonomyRevision' = :taxonomyRevision
                AND (j.classification ->> 'placementVersion' = COALESCE(placement.version, 0)::text
                    OR (j.status = 'succeeded' AND j.classification ->> 'outcome' IN ('applied', 'unclassified')
                        AND j.classification ->> 'placementVersion' = (placement.version - 1)::text))
                AND (j.status IN ('queued', 'running') OR (:unclassifiedOnly AND j.status = 'succeeded'
                    AND j.classification ->> 'outcome' IN ('applied', 'unclassified')))
            )`,
                { taxonomyRevision: String(taxonomy.revision), unclassifiedOnly }
            )
            if (unclassifiedOnly) query.andWhere('placement."folderId" IS NULL')
            query.andWhere(`NOT EXISTS (SELECT 1 FROM knowledge_wiki_job j
                WHERE j."knowledgebaseId" = page."knowledgebaseId" AND j.type = 'classify' AND j."isCurrent" = true
                AND j.classification ->> 'mode' = 'taxonomy' AND j.status = 'succeeded' AND :unclassifiedOnly
                AND j.classification ->> 'appliedTaxonomyRevision' = :taxonomyRevision
                AND j.classification -> 'pages' @> jsonb_build_array(jsonb_build_object(
                    'pageId', page.id::text, 'pageVersionId', page."activeVersionId"::text, 'placementVersion', placement.version - 1))
                AND j.classification -> 'results' @> jsonb_build_array(jsonb_build_object('pageId', page.id::text, 'outcome', 'unclassified'))
            )`)
            const pages = await wikiPageRows(query.orderBy('page.id', 'ASC').limit(101))
            if (!hasFolders && pages.length)
                await this.taxonomyBuilder.enqueue(manager, full, taxonomy.revision, pages.slice(0, 100), runId)
            else
                for (const page of pages.slice(0, 100))
                    await this.enqueue(
                        manager,
                        full,
                        page.id,
                        page.activeVersionId,
                        taxonomy.revision,
                        RequestContext.currentUserId(),
                        runId,
                        'backfill'
                    )
            return { runId, count: Math.min(100, pages.length), truncated: pages.length > 100 }
        })
    }

    async status(id: string): Promise<KnowledgeWikiClassificationStatus> {
        await this.organization.authorize(id, true)
        const activeJobs = await this.organization.dataSource.getRepository(KnowledgeWikiJob).countBy({
            knowledgebaseId: id,
            type: 'classify',
            isCurrent: true,
            status: In(['queued', 'running'])
        })
        return { activeJobs }
    }

    async list(id: string, runId?: string): Promise<KnowledgeWikiClassificationItem[]> {
        const kb = await this.organization.authorize(id, true)
        return this.organization.dataSource.transaction('REPEATABLE READ', async (manager) => {
            const query = manager
                .getRepository(KnowledgeWikiJob)
                .createQueryBuilder('job')
                .where('job."knowledgebaseId" = :id AND job.type = :type', { id, type: 'classify' })
            if (runId) query.andWhere("job.classification ->> 'runId' = :runId", { runId })
            const jobs = await query.orderBy('job."createdAt"', 'DESC').addOrderBy('job.id', 'ASC').take(100).getMany()
            const pageIds = jobs.flatMap((job) =>
                job.classification?.mode === 'taxonomy'
                    ? job.classification.pages.map((page) => page.pageId)
                    : job.classification
                      ? [job.classification.pageId]
                      : []
            )
            if (!pageIds.length) return []
            const pages = await wikiPageRows(
                visibleWikiPages(manager, kb).andWhere('page.id IN (:...ids)', { ids: pageIds })
            )
            const byId = new Map(pages.map((page) => [page.id, page]))
            const taxonomy = await this.organization.taxonomy(manager, kb)
            const invocations = await manager
                .getRepository(KnowledgeWikiModelInvocation)
                .findBy({ jobId: In(jobs.map((job) => job.id)), status: 'indeterminate' })
            return jobs.flatMap((job): KnowledgeWikiClassificationItem[] => {
                const input = job.classification
                if (input?.mode === 'taxonomy')
                    return input.pages.flatMap((snapshot): KnowledgeWikiClassificationItem[] => {
                        const page = byId.get(snapshot.pageId)
                        if (!page) return []
                        const result = input.results?.find((result) => result.pageId === snapshot.pageId)
                        const stale =
                            page.activeVersionId !== snapshot.pageVersionId ||
                            result?.outcome === 'stale' ||
                            (!result &&
                                (taxonomy.revision !== input.taxonomyRevision ||
                                    page.placementSource === 'manual' ||
                                    (page.placementVersion ?? 0) !== snapshot.placementVersion))
                        return [
                            {
                                jobId: job.id,
                                runId: input.runId,
                                pageId: page.id,
                                title: page.title,
                                status: stale ? 'stale' : job.status,
                                result: stale ? undefined : result?.result,
                                outcome: stale ? 'stale' : result?.outcome,
                                error: job.error,
                                requiresAdditionalChargeConfirmation: invocations.some(
                                    (invocation) =>
                                        invocation.jobId === job.id &&
                                        invocation.generationAttempt === job.generationAttempt
                                )
                            }
                        ]
                    })
                const page = input ? byId.get(input.pageId) : null
                if (!input || !page) return []
                const applied =
                    input.outcome === 'applied' || (input.applyAutomatically && input.outcome === 'unclassified')
                const stale =
                    page.activeVersionId !== input.pageVersionId ||
                    (!applied &&
                        (taxonomy.revision !== input.taxonomyRevision ||
                            page.placementSource === 'manual' ||
                            (page.placementVersion ?? 0) !== input.placementVersion))
                return [
                    {
                        jobId: job.id,
                        runId: input.runId,
                        pageId: page.id,
                        title: page.title,
                        status: stale ? 'stale' : job.status,
                        result: stale ? undefined : input.result,
                        outcome: stale ? 'stale' : input.outcome,
                        error: job.error,
                        requiresAdditionalChargeConfirmation: invocations.some(
                            (invocation) =>
                                invocation.jobId === job.id && invocation.generationAttempt === job.generationAttempt
                        )
                    }
                ]
            })
        })
    }

    async process(job: KnowledgeWikiJob) {
        const input = job.classification
        if (!input) throw wikiOrganizationError()
        if (input.mode === 'taxonomy') return this.taxonomyBuilder.process(job, input)
        const snapshot = await this.organization.dataSource.transaction('REPEATABLE READ', async (manager) => {
            const kb = await manager
                .getRepository(Knowledgebase)
                .findOneOrFail({ where: { id: job.knowledgebaseId }, relations: ['wikiModel', 'chatModel'] })
            const current = await this.current(manager, kb, job)
            if (!current) return null
            const folders = await manager
                .getRepository(KnowledgeWikiFolder)
                .find({ where: { knowledgebaseId: kb.id }, order: { id: 'ASC' } })
            if (!folders.length) return null
            const version = await manager
                .getRepository(KnowledgeWikiPageVersion)
                .findOneOrFail({ where: { id: input.pageVersionId, pageId: input.pageId, knowledgebaseId: kb.id } })
            return {
                kb,
                modelInput: {
                    title: version.title,
                    summary: version.summary,
                    content: version.contentMarkdown.slice(0, 16000),
                    folders: folders.map((folder) => ({
                        id: folder.id,
                        parentId: folder.parentId,
                        name: folder.name,
                        description: folder.description.slice(0, 500)
                    }))
                }
            }
        })
        if (!snapshot) return this.stale(job)
        const result = await this.models.invokeClassificationModel(job, snapshot.kb, snapshot.modelInput)
        await this.organization.dataSource.transaction(async (manager) => {
            const kb = await this.organization.lock(manager, job.knowledgebaseId)
            const jobs = manager.getRepository(KnowledgeWikiJob)
            const owned = await jobs.findOne({
                where: { id: job.id, status: 'running', isCurrent: true, executionAttempt: job.executionAttempt },
                lock: { mode: 'pessimistic_write' }
            })
            if (!owned) return
            if (!(await this.current(manager, kb, job))) {
                await jobs.update(
                    { id: job.id, status: 'running', executionAttempt: job.executionAttempt },
                    { status: 'stale', isCurrent: false, completedAt: new Date(), lockedAt: null, leaseExpiresAt: null }
                )
                return
            }
            job.classification = {
                ...input,
                result,
                outcome: input.applyAutomatically ? (result.folderId ? 'applied' : 'unclassified') : 'suggested'
            }
            if (input.applyAutomatically) await this.writePlacement(manager, kb, job)
            await jobs.update(job.id, {
                classification: job.classification,
                status: 'succeeded',
                completedAt: new Date(),
                lockedAt: null,
                leaseExpiresAt: null
            })
        })
    }

    async apply(id: string, jobIds: string[]) {
        await this.organization.authorize(id, true)
        return this.organization.dataSource.transaction(async (manager) => {
            const kb = await this.organization.lock(manager, id)
            const jobs = await manager
                .getRepository(KnowledgeWikiJob)
                .findBy({ id: In(jobIds), knowledgebaseId: id, type: 'classify', status: 'succeeded' })
            if (jobs.length !== new Set(jobIds).size) throw wikiOrganizationError()
            for (const job of jobs) {
                if (job.classification?.mode === 'taxonomy') throw wikiOrganizationError()
                if (
                    job.classification?.outcome === 'applied' ||
                    (job.classification?.applyAutomatically && job.classification.outcome === 'unclassified')
                )
                    continue
                if (!job.classification?.result || !(await this.current(manager, kb, job)))
                    throw this.organization.conflict()
                await this.writePlacement(manager, kb, job)
                await manager
                    .getRepository(KnowledgeWikiJob)
                    .update(job.id, { classification: { ...job.classification, outcome: 'applied' } })
            }
            return { applied: jobs.length }
        })
    }

    private async current(manager: EntityManager, kb: Knowledgebase, job: KnowledgeWikiJob) {
        const input = job.classification
        if (!input || input.mode === 'taxonomy' || !normalizeKnowledgebaseWikiConfig(kb.wikiConfig).enabled)
            return false
        const full = await manager
            .getRepository(Knowledgebase)
            .findOneOrFail({ where: { id: kb.id }, relations: ['wikiModel', 'chatModel'] })
        if (
            createKnowledgeWikiConfigFingerprint(full.wikiConfig, resolveKnowledgeWikiModel(full)) !==
            job.configFingerprint
        )
            return false
        const config = await this.organization.taxonomy(manager, kb)
        if (config.revision !== input.taxonomyRevision) return false
        const placement = await manager
            .getRepository(KnowledgeWikiPlacement)
            .findOneBy({ pageId: input.pageId, knowledgebaseId: kb.id })
        if (placement?.source === 'manual' || (placement?.version ?? 0) !== input.placementVersion) return false
        return await visibleWikiPages(manager, kb)
            .andWhere('page.id = :pageId AND page."activeVersionId" = :versionId', {
                pageId: input.pageId,
                versionId: input.pageVersionId
            })
            .getExists()
    }

    private async writePlacement(manager: EntityManager, kb: Knowledgebase, job: KnowledgeWikiJob) {
        const input = job.classification
        if (
            !input ||
            input.mode === 'taxonomy' ||
            !input.result ||
            (input.result.folderId &&
                !(await manager
                    .getRepository(KnowledgeWikiFolder)
                    .existsBy({ id: input.result.folderId, knowledgebaseId: kb.id })))
        )
            throw wikiOrganizationError()
        const repo = manager.getRepository(KnowledgeWikiPlacement)
        const placement =
            (await repo.findOneBy({ knowledgebaseId: kb.id, pageId: input.pageId })) ??
            repo.create({
                knowledgebaseId: kb.id,
                tenantId: kb.tenantId,
                organizationId: kb.organizationId,
                pageId: input.pageId
            })
        Object.assign(placement, {
            folderId: input.result.folderId,
            source: 'automatic',
            version: input.placementVersion + 1
        })
        await repo.save(placement)
    }

    private stale(job: KnowledgeWikiJob) {
        return this.organization.dataSource
            .getRepository(KnowledgeWikiJob)
            .update(
                { id: job.id, status: 'running', executionAttempt: job.executionAttempt },
                { status: 'stale', isCurrent: false, completedAt: new Date(), lockedAt: null, leaseExpiresAt: null }
            )
    }
}
