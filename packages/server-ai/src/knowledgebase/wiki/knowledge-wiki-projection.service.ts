import {
    DocumentTypeEnum,
    IKnowledgeWikiChunkMetadata,
    KBDocumentCategoryEnum,
    KBDocumentStatusEnum,
    isKnowledgeWikiChunkMetadata
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, QueryFailedError, Repository } from 'typeorm'
import { v5 as uuidv5 } from 'uuid'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { computeKnowledgeDocumentChunkHash } from '../../knowledge-document/document-hash'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { KnowledgeDocumentService } from '../../knowledge-document/document.service'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeWikiPage, KnowledgeWikiPageVersion, KnowledgeWikiProjectionState } from './entities'
import { KnowledgeWikiError } from './knowledge-wiki-error'

const WIKI_PROJECTION_SOURCE_KEY = 'system:knowledge-wiki'
const WIKI_PROJECTION_TYPE = 'knowledge-wiki'
const MAX_ERROR_LENGTH = 4000

@Injectable()
export class KnowledgeWikiProjectionService {
    private readonly logger = new Logger(KnowledgeWikiProjectionService.name)

    constructor(
        @InjectRepository(KnowledgeDocument)
        private readonly documentRepository: Repository<KnowledgeDocument>,
        @InjectRepository(KnowledgeDocumentChunk)
        private readonly chunkRepository: Repository<KnowledgeDocumentChunk>,
        @InjectRepository(KnowledgeWikiPageVersion)
        private readonly pageVersionRepository: Repository<KnowledgeWikiPageVersion>,
        @InjectRepository(KnowledgeWikiProjectionState)
        private readonly projectionStateRepository: Repository<KnowledgeWikiProjectionState>,
        private readonly documentService: KnowledgeDocumentService,
        private readonly knowledgebaseService: KnowledgebaseService
    ) {}

    async stage(knowledgebase: Knowledgebase, page: KnowledgeWikiPage, version: KnowledgeWikiPageVersion) {
        const projectionDocument = await this.ensureProjectionDocument(knowledgebase)
        const logicalChunkId = `wiki:${page.id}:${version.id}:root`
        const metadata = {
            chunkId: logicalChunkId,
            contentKind: 'wiki',
            wikiPageId: page.id,
            wikiPageVersionId: version.id,
            wikiPageKey: page.pageKey,
            wikiPageType: page.pageType,
            wikiRevision: version.generationRevision,
            sectionAnchor: 'root',
            projectionStatus: 'ready',
            contentFormat: 'text',
            mediaType: 'text',
            searchContent: `${version.title}\n${version.summary}\n${version.contentMarkdown}`
        } satisfies IKnowledgeWikiChunkMetadata
        const existing = (projectionDocument.chunks ?? []).find(
            (chunk) =>
                chunk.metadata &&
                'wikiPageVersionId' in chunk.metadata &&
                chunk.metadata.wikiPageVersionId === version.id
        )
        const pageContent = `${version.title}\n\n${version.summary}\n\n${version.contentMarkdown}`
        const chunk = this.chunkRepository.create({
            ...(existing ?? {}),
            id: existing?.id ?? uuidv5(logicalChunkId, uuidv5.URL),
            tenantId: knowledgebase.tenantId,
            organizationId: knowledgebase.organizationId,
            knowledgebaseId: knowledgebase.id,
            documentId: projectionDocument.id,
            pageContent,
            metadata,
            contentHash: computeKnowledgeDocumentChunkHash({ pageContent, metadata })
        })
        try {
            // Keep TypeORM's tree/closure persistence; concurrent attempts can share the same stable root ID.
            try {
                await this.chunkRepository.save(chunk)
            } catch (error) {
                if (
                    !(error instanceof QueryFailedError) ||
                    !('code' in error.driverError) ||
                    error.driverError.code !== '23505'
                )
                    throw error
                const persisted = await this.chunkRepository.findOne({
                    where: { id: chunk.id, knowledgebaseId: knowledgebase.id, documentId: projectionDocument.id }
                })
                if (
                    !persisted ||
                    persisted.contentHash !== chunk.contentHash ||
                    !isKnowledgeWikiChunkMetadata(persisted.metadata) ||
                    persisted.metadata.wikiPageVersionId !== version.id
                )
                    throw error
            }
            const vectorStore = await this.knowledgebaseService.getActiveVectorStore(knowledgebase.id, true)
            await vectorStore.addKnowledgeDocument(projectionDocument, [chunk])
            version.projectionStatus = 'ready'
            version.projectionError = null
            await this.pageVersionRepository.save(version)
        } catch (error) {
            version.projectionStatus = 'failed'
            version.projectionError = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH)
            await this.pageVersionRepository.save(version)
            throw new KnowledgeWikiError('knowledge_wiki_index_failed', page.id, error)
        }
    }

    async retireVersions(knowledgebase: Knowledgebase, versionIds: string[]) {
        const uniqueVersionIds = [...new Set(versionIds)]
        if (!uniqueVersionIds.length) return
        const state = await this.projectionStateRepository.findOne({ where: { knowledgebaseId: knowledgebase.id } })
        if (state?.projectionDocumentId) {
            const chunks = await this.chunkRepository.find({ where: { documentId: state.projectionDocumentId } })
            const retiredChunks = chunks.filter(
                (chunk) =>
                    isKnowledgeWikiChunkMetadata(chunk.metadata) &&
                    uniqueVersionIds.includes(chunk.metadata.wikiPageVersionId)
            )
            if (retiredChunks.length) {
                const vectorStore = await this.knowledgebaseService.getActiveVectorStore(knowledgebase.id, true)
                await vectorStore.deleteChunks(retiredChunks.map((chunk) => chunk.id))
                await this.chunkRepository.delete({ id: In(retiredChunks.map((chunk) => chunk.id)) })
            }
        }
        await this.pageVersionRepository.update(
            { knowledgebaseId: knowledgebase.id, id: In(uniqueVersionIds) },
            { projectionStatus: 'disabled', projectionError: null }
        )
    }

    async retireSupersededVersions(knowledgebaseId?: string) {
        // Published versions cannot become active again: publication advances the page's optimistic version.
        // The committed pointer is the cleanup authority, including retries after a worker crash.
        const query = this.pageVersionRepository
            .createQueryBuilder('version')
            .innerJoinAndSelect('version.knowledgebase', 'knowledgebase')
            .innerJoin('version.page', 'page')
            .where('version.publishedAt IS NOT NULL')
            .andWhere('version.projectionStatus <> :disabled', { disabled: 'disabled' })
            .andWhere('page.knowledgebaseId = version.knowledgebaseId')
            .andWhere('page.activeVersionId IS DISTINCT FROM version.id')
            .orderBy('version.updatedAt', 'ASC')
            .addOrderBy('version.id', 'ASC')
        if (knowledgebaseId) query.andWhere('version.knowledgebaseId = :knowledgebaseId', { knowledgebaseId })
        else query.take(50)

        const groups = new Map<string, KnowledgeWikiPageVersion[]>()
        for (const version of await query.getMany()) {
            const group = groups.get(version.knowledgebaseId) ?? []
            group.push(version)
            groups.set(version.knowledgebaseId, group)
        }
        for (const versions of groups.values()) {
            const versionIds = versions.map((version) => version.id)
            try {
                await this.retireVersions(versions[0].knowledgebase, versionIds)
            } catch (error) {
                const message = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH)
                // Keep the versions discoverable; updatedAt moves a failed batch behind other cleanup work.
                await this.pageVersionRepository.update({ id: In(versionIds) }, { projectionError: message })
                this.logger.warn(`Wiki projection cleanup will retry for '${versions[0].knowledgebaseId}': ${message}`)
            }
        }
    }

    private async ensureProjectionDocument(knowledgebase: Knowledgebase) {
        let state = await this.projectionStateRepository.findOne({ where: { knowledgebaseId: knowledgebase.id } })
        if (state?.projectionDocumentId) {
            const existing = await this.documentRepository.findOne({
                where: { id: state.projectionDocumentId, knowledgebaseId: knowledgebase.id },
                relations: ['chunks']
            })
            if (existing) return existing
        }
        let document = await this.documentRepository.findOne({
            where: { knowledgebaseId: knowledgebase.id, sourceKey: WIKI_PROJECTION_SOURCE_KEY },
            relations: ['chunks']
        })
        if (!document) {
            document = await this.documentService.createDocument({
                knowledgebaseId: knowledgebase.id,
                name: 'Wiki',
                filePath: '.system/wiki',
                sourceKey: WIKI_PROJECTION_SOURCE_KEY,
                sourceType: DocumentTypeEnum.FILE,
                category: KBDocumentCategoryEnum.Text,
                type: 'txt',
                mimeType: 'text/plain',
                status: KBDocumentStatusEnum.FINISH,
                metadata: { systemManaged: true, systemManagedType: WIKI_PROJECTION_TYPE }
            })
            document.chunks = []
        }
        if (!state) {
            state = this.projectionStateRepository.create({
                tenantId: knowledgebase.tenantId,
                organizationId: knowledgebase.organizationId,
                knowledgebaseId: knowledgebase.id,
                projectionEpoch: 0,
                status: 'pending'
            })
        }
        state.projectionDocumentId = document.id
        state.status = 'ready'
        state.error = null
        await this.projectionStateRepository.save(state)
        return document
    }
}
