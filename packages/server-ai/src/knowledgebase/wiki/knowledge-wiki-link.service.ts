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
    createKnowledgeWikiMappedPageIdentity,
    KnowledgeWikiIndexKind
} from './knowledge-wiki-identity'

function resolveTargetPageKey(type: KnowledgeWikiPageType, canonicalName: string) {
    if (type === 'summary') return null
    if (type === 'index') {
        const kind = canonicalName.normalize('NFKC').trim().toLowerCase()
        return kind === 'root' || kind === 'summary' || kind === 'entity' || kind === 'concept'
            ? createKnowledgeWikiIndexPageKey(kind as KnowledgeWikiIndexKind)
            : null
    }
    return createKnowledgeWikiMappedPageIdentity(type, canonicalName, '').pageKey
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
        const targetKeys = [
            ...new Set(
                suggestions.flatMap((item) => {
                    const key = resolveTargetPageKey(item.targetType, item.targetCanonicalName)
                    return key ? [key] : []
                })
            )
        ]
        if (!targetKeys.length) return
        const targets = await this.pageRepository.find({
            where: { knowledgebaseId: knowledgebase.id, pageKey: In(targetKeys) }
        })
        const targetsByKey = new Map(targets.map((target) => [target.pageKey, target]))
        const unique = new Map<string, KnowledgeWikiPageLinkEntity>()
        for (const suggestion of suggestions) {
            const targetKey = resolveTargetPageKey(suggestion.targetType, suggestion.targetCanonicalName)
            const target = targetKey ? targetsByKey.get(targetKey) : null
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
