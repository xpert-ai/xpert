import { DocumentInterface } from '@langchain/core/documents'
import {
    DocumentMetadata,
    IKnowledgebase,
    isKnowledgeWikiChunkMetadata,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
    KnowledgeWikiPage,
    KnowledgeWikiPageEvidenceEntity,
    KnowledgeWikiPageVersion,
    KnowledgeWikiSourceState
} from './entities'

@Injectable()
export class KnowledgeWikiSearchScopeService {
    constructor(
        @InjectRepository(KnowledgeWikiPage)
        private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiPageVersion)
        private readonly versionRepository: Repository<KnowledgeWikiPageVersion>,
        @InjectRepository(KnowledgeWikiPageEvidenceEntity)
        private readonly evidenceRepository: Repository<KnowledgeWikiPageEvidenceEntity>,
        @InjectRepository(KnowledgeWikiSourceState)
        private readonly sourceStateRepository: Repository<KnowledgeWikiSourceState>
    ) {}

    async filterVisibleCandidates(
        knowledgebase: IKnowledgebase,
        documents: DocumentInterface<DocumentMetadata>[],
        hasKnowledgeFilter: boolean
    ) {
        const ordinary = documents.filter((document) => !isKnowledgeWikiChunkMetadata(document.metadata))
        const wiki = documents.filter((document) => isKnowledgeWikiChunkMetadata(document.metadata))
        if (!wiki.length) return documents
        if (
            hasKnowledgeFilter ||
            !normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig).enabled ||
            knowledgebase.wikiAvailability === 'unavailable'
        ) {
            return ordinary
        }

        const pageIds = [...new Set(wiki.map((document) => document.metadata.wikiPageId))]
        const pages = await this.pageRepository.find({
            where: {
                knowledgebaseId: knowledgebase.id,
                id: In(pageIds),
                status: 'ready',
                projectionStatus: 'ready'
            }
        })
        const activeVersionIds = pages.flatMap((page) => (page.activeVersionId ? [page.activeVersionId] : []))
        if (!activeVersionIds.length) return ordinary
        const versions = await this.versionRepository.find({
            where: {
                knowledgebaseId: knowledgebase.id,
                id: In(activeVersionIds),
                status: 'ready',
                projectionStatus: 'ready'
            }
        })
        const validVersions = new Set(versions.map((version) => version.id))
        const evidence = await this.evidenceRepository.find({
            where: { knowledgebaseId: knowledgebase.id, pageVersionId: In(activeVersionIds) }
        })
        const sourceIds = [...new Set(evidence.map((item) => item.sourceDocumentIdSnapshot))]
        const eligibleStates = sourceIds.length
            ? await this.sourceStateRepository.find({
                  where: {
                      knowledgebaseId: knowledgebase.id,
                      sourceDocumentIdSnapshot: In(sourceIds),
                      eligible: true,
                      cleanupPending: false
                  }
              })
            : []
        const eligibleSources = new Map(eligibleStates.map((state) => [state.sourceDocumentIdSnapshot, state]))
        const invalidVersions = new Set(
            evidence
                .filter((item) => {
                    const source = eligibleSources.get(item.sourceDocumentIdSnapshot)
                    return !source || source.lastContentHash !== item.sourceContentHash
                })
                .map((item) => item.pageVersionId)
        )
        const activeByPage = new Map(pages.map((page) => [page.id, page.activeVersionId]))
        const seenPages = new Set<string>()
        const rankedWiki = [...wiki].sort(
            (left, right) =>
                (right.metadata.relevanceScore ?? right.metadata.score ?? 0) -
                (left.metadata.relevanceScore ?? left.metadata.score ?? 0)
        )
        const visibleWiki = rankedWiki.filter((document) => {
            const metadata = document.metadata
            if (!isKnowledgeWikiChunkMetadata(metadata)) return false
            if (seenPages.has(metadata.wikiPageId)) return false
            if (activeByPage.get(metadata.wikiPageId) !== metadata.wikiPageVersionId) return false
            if (!validVersions.has(metadata.wikiPageVersionId) || invalidVersions.has(metadata.wikiPageVersionId)) {
                return false
            }
            seenPages.add(metadata.wikiPageId)
            return true
        })
        return [...ordinary, ...visibleWiki].sort(
            (left, right) =>
                (right.metadata.relevanceScore ?? right.metadata.score ?? 0) -
                (left.metadata.relevanceScore ?? left.metadata.score ?? 0)
        )
    }
}
