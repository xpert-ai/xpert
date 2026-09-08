import { KnowledgeWikiPageType } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { In, IsNull, Not, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiPageLinkEntity, KnowledgeWikiPageVersion } from './entities'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import { createKnowledgeWikiIndexPageIdentity, KnowledgeWikiIndexKind } from './knowledge-wiki-identity'

export type KnowledgeWikiFinalizeCandidate = {
    page: KnowledgeWikiPage
    version: KnowledgeWikiPageVersion | null
}

type PageTarget = {
    page: KnowledgeWikiPage
    title: string
    summary: string
}

const CONTENT_PAGE_TYPES: Array<Exclude<KnowledgeWikiPageType, 'index'>> = ['summary', 'entity', 'concept']

@Injectable()
export class KnowledgeWikiIndexService {
    constructor(
        @InjectRepository(KnowledgeWikiPage)
        private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiPageVersion)
        private readonly versionRepository: Repository<KnowledgeWikiPageVersion>,
        @InjectRepository(KnowledgeWikiPageLinkEntity)
        private readonly linkRepository: Repository<KnowledgeWikiPageLinkEntity>
    ) {}

    async prepare(
        knowledgebase: Knowledgebase,
        job: KnowledgeWikiJob,
        candidates: KnowledgeWikiFinalizeCandidate[]
    ): Promise<KnowledgeWikiFinalizeCandidate[]> {
        const activePages = await this.pageRepository.find({
            where: {
                knowledgebaseId: knowledgebase.id,
                pageType: Not('index'),
                status: 'ready',
                activeVersionId: Not(IsNull())
            }
        })
        const activeVersionIds = activePages.flatMap((page) => (page.activeVersionId ? [page.activeVersionId] : []))
        const activeVersions = activeVersionIds.length
            ? await this.versionRepository.find({ where: { id: In(activeVersionIds), status: 'ready' } })
            : []
        const versionsById = new Map(activeVersions.map((version) => [version.id, version]))
        const targets = new Map<string, PageTarget>()
        for (const page of activePages) {
            const version = page.activeVersionId ? versionsById.get(page.activeVersionId) : null
            if (version) targets.set(page.id, { page, title: version.title, summary: version.summary })
        }
        for (const candidate of candidates) {
            if (candidate.page.pageType === 'index') continue
            if (!candidate.version) {
                targets.delete(candidate.page.id)
            } else {
                targets.set(candidate.page.id, {
                    page: candidate.page,
                    title: candidate.version.title,
                    summary: candidate.version.summary
                })
            }
        }

        const nonIndexCandidates = candidates.filter((candidate) => candidate.page.pageType !== 'index')
        const existingIndexCandidates = candidates.filter((candidate) => candidate.page.pageType === 'index')
        if (!targets.size) return [...nonIndexCandidates, ...existingIndexCandidates]

        const indexCandidates: KnowledgeWikiFinalizeCandidate[] = []
        const indexPages = new Map<KnowledgeWikiIndexKind, KnowledgeWikiPage>()
        for (const kind of ['root', ...CONTENT_PAGE_TYPES] as KnowledgeWikiIndexKind[]) {
            const targetPages =
                kind === 'root'
                    ? [...targets.values()]
                    : [...targets.values()].filter(({ page }) => page.pageType === kind)
            const candidate = await this.prepareIndexPage(knowledgebase, job, kind, targetPages)
            indexCandidates.push(candidate)
            indexPages.set(kind, candidate.page)
        }

        for (const candidate of indexCandidates) {
            if (!candidate.version) continue
            const versionId = candidate.version.id
            await this.linkRepository.delete({ sourcePageVersionId: versionId })
            const kind = candidate.page.pageKey.slice('index:'.length) as KnowledgeWikiIndexKind
            const linkTargets =
                kind === 'root'
                    ? CONTENT_PAGE_TYPES.flatMap((type) => {
                          const page = indexPages.get(type)
                          return page ? [{ page, label: page.canonicalName }] : []
                      })
                    : [...targets.values()]
                          .filter(({ page }) => page.pageType === kind)
                          .map(({ page, title }) => ({ page, label: title }))
            if (linkTargets.length) {
                await this.linkRepository.save(
                    linkTargets.map(({ page, label }) =>
                        this.linkRepository.create({
                            tenantId: knowledgebase.tenantId,
                            organizationId: knowledgebase.organizationId,
                            knowledgebaseId: knowledgebase.id,
                            sourcePageId: candidate.page.id,
                            sourcePageVersionId: versionId,
                            targetPageId: page.id,
                            sectionAnchor: null,
                            label
                        })
                    )
                )
            }
        }
        return [...nonIndexCandidates, ...indexCandidates]
    }

    private async prepareIndexPage(
        knowledgebase: Knowledgebase,
        job: KnowledgeWikiJob,
        kind: KnowledgeWikiIndexKind,
        targets: PageTarget[]
    ): Promise<KnowledgeWikiFinalizeCandidate> {
        const identity = createKnowledgeWikiIndexPageIdentity(kind)
        let page = await this.pageRepository.findOne({
            where: { knowledgebaseId: knowledgebase.id, pageKey: identity.pageKey }
        })
        if (!page) {
            try {
                page = await this.pageRepository.save(
                    this.pageRepository.create({
                        tenantId: knowledgebase.tenantId,
                        organizationId: knowledgebase.organizationId,
                        knowledgebaseId: knowledgebase.id,
                        pageType: 'index',
                        ...identity,
                        status: 'building',
                        projectionStatus: 'pending',
                        sourceCount: 0,
                        inboundLinkCount: 0,
                        outboundLinkCount: 0
                    })
                )
            } catch {
                page = await this.pageRepository.findOne({
                    where: { knowledgebaseId: knowledgebase.id, pageKey: identity.pageKey }
                })
            }
        }
        if (!page) {
            throw new Error(
                t('server-ai:Error.KnowledgebaseWikiIndexCreateFailed', {
                    defaultValue: 'The deterministic Wiki index page could not be created'
                })
            )
        }

        let version = await this.versionRepository.findOne({
            where: { pageId: page.id, producerJobId: job.id, generationAttempt: job.generationAttempt }
        })
        if (!version) {
            const sortedTargets = [...targets].sort(
                (left, right) => left.title.localeCompare(right.title) || left.page.id.localeCompare(right.page.id)
            )
            const contentMarkdown = sortedTargets.length
                ? sortedTargets
                      .map(({ title, summary }) => `- **${title}**${summary ? ` — ${summary}` : ''}`)
                      .join('\n')
                : 'No pages yet.'
            const summary =
                kind === 'root'
                    ? `Browse ${targets.length} generated Wiki pages by type.`
                    : `Browse ${targets.length} ${kind} pages.`
            version = await this.versionRepository.save(
                this.versionRepository.create({
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    pageId: page.id,
                    producerJobId: job.id,
                    generationAttempt: job.generationAttempt,
                    generationRevision: job.generationRevision,
                    generatorVersion: job.generatorVersion,
                    configFingerprint: job.configFingerprint,
                    expectedPageVersion: page.version,
                    title: identity.canonicalName,
                    summary,
                    contentMarkdown,
                    aliases: [],
                    contentHash: hashKnowledgeWikiValue({ kind, summary, contentMarkdown }),
                    status: 'building',
                    projectionStatus: 'pending'
                })
            )
        }
        return { page, version }
    }
}
