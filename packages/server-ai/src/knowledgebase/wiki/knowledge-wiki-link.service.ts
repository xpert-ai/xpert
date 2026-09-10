import { loadIdentityCatalogue } from '../identity/knowledge-identity-catalogue'
import { KnowledgeWikiPageType } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiPageLinkEntity,
    KnowledgeWikiPageVersion
} from './entities'
import {
    createKnowledgeWikiIndexPageKey,
    normalizeKnowledgeWikiCanonicalName,
    KnowledgeWikiIndexKind
} from './knowledge-wiki-identity'

function resolveIndexPageKey(type: KnowledgeWikiPageType, canonicalName: string) {
    if (type === 'summary') return null
    if (type === 'index') {
        const kind = canonicalName.normalize('NFKC').trim().toLowerCase()
        return kind === 'root' || kind === 'summary' || kind === 'entity' || kind === 'concept'
            ? createKnowledgeWikiIndexPageKey(kind as KnowledgeWikiIndexKind)
            : null
    }
    return null
}

@Injectable()
export class KnowledgeWikiLinkService {
    constructor(
        @InjectRepository(KnowledgeWikiPage)
        private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiPageContribution)
        private readonly contributionRepository: Repository<KnowledgeWikiPageContribution>,
        @InjectRepository(KnowledgeWikiPageLinkEntity)
        private readonly linkRepository: Repository<KnowledgeWikiPageLinkEntity>
    ) {}

    async stageGeneratedLinks(
        knowledgebase: Knowledgebase,
        page: KnowledgeWikiPage,
        version: KnowledgeWikiPageVersion
    ) {
        await this.linkRepository.delete({ sourcePageVersionId: version.id })
        const contributions = await this.contributionRepository.find({ where: { pageVersionId: version.id } })
        const suggestions = contributions.flatMap((contribution) => contribution.payload.suggestedLinks)
        if (!suggestions.length) return
        const targets = await this.pageRepository.find({
            where: {
                knowledgebaseId: knowledgebase.id,
                pageType: In([...new Set(suggestions.map((item) => item.targetType))])
            }
        })
        const aliases = new Map<string, string[]>()
        for (const kind of ['entity', 'concept'] as const) {
            if (!targets.some((target) => target.pageType === kind && target.identityId)) continue
            const catalogue = await loadIdentityCatalogue(
                this.pageRepository.manager,
                {
                    knowledgebaseId: knowledgebase.id,
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId
                },
                kind
            )
            for (const entry of catalogue.entries) aliases.set(entry.id, entry.profile.aliases)
        }
        const targetsByName = new Map<string, Set<KnowledgeWikiPage>>()
        for (const target of targets) {
            for (const name of [target.canonicalName, ...(aliases.get(target.identityId) ?? [])]) {
                const key = `${target.pageType}:${normalizeKnowledgeWikiCanonicalName(name)}`
                const matches = targetsByName.get(key) ?? new Set<KnowledgeWikiPage>()
                matches.add(target)
                targetsByName.set(key, matches)
            }
        }
        const unique = new Map<string, KnowledgeWikiPageLinkEntity>()
        for (const suggestion of suggestions) {
            const indexKey = resolveIndexPageKey(suggestion.targetType, suggestion.targetCanonicalName)
            const matches = targetsByName.get(
                `${suggestion.targetType}:${normalizeKnowledgeWikiCanonicalName(suggestion.targetCanonicalName)}`
            )
            const target = indexKey
                ? targets.find((page) => page.pageKey === indexKey)
                : suggestion.targetType !== 'summary' && matches?.size === 1
                  ? [...matches][0]
                  : null
            if (!target || target.id === page.id) continue
            const key = `${target.id}:${suggestion.label ?? ''}`
            if (unique.has(key)) continue
            unique.set(
                key,
                this.linkRepository.create({
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    sourcePageId: page.id,
                    sourcePageVersionId: version.id,
                    targetPageId: target.id,
                    sectionAnchor: null,
                    label: suggestion.label ?? null
                })
            )
        }
        if (unique.size) await this.linkRepository.save([...unique.values()])
    }

    async refreshCounts(knowledgebaseId: string) {
        const pages = await this.pageRepository.find({ where: { knowledgebaseId }, select: { id: true } })
        if (!pages.length) return
        const activeLinks = this.linkRepository
            .createQueryBuilder('link')
            .innerJoin('link.sourcePage', 'source')
            .innerJoin('link.targetPage', 'target')
            .where('link.knowledgebaseId = :knowledgebaseId', { knowledgebaseId })
            .andWhere('source.knowledgebaseId = link.knowledgebaseId AND target.knowledgebaseId = link.knowledgebaseId')
            .andWhere('source.activeVersionId = link.sourcePageVersionId')
            .andWhere('source.status = :ready AND source.projectionStatus = :ready', { ready: 'ready' })
            .andWhere(
                'target.status = :ready AND target.projectionStatus = :ready AND target.activeVersionId IS NOT NULL'
            )
        for (const page of pages) {
            const [inboundLinkCount, outboundLinkCount] = await Promise.all([
                activeLinks.clone().andWhere('link.targetPageId = :pageId', { pageId: page.id }).getCount(),
                activeLinks.clone().andWhere('link.sourcePageId = :pageId', { pageId: page.id }).getCount()
            ])
            // Derived counts must not advance the optimistic content-publication version.
            await this.pageRepository.update(page.id, {
                inboundLinkCount,
                outboundLinkCount,
                version: () => '"version"'
            })
        }
    }
}
