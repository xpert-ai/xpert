import { DocumentInterface } from '@langchain/core/documents'
import {
    classificateDocumentCategory,
    DocumentMetadata,
    DocumentSourceProviderCategoryEnum,
    DocumentTypeEnum,
    IKnowledgeDocumentChunk,
    IKnowledgeDocument,
    IKnowledgeGraphEntity,
    IKnowledgeGraphMention,
    IKnowledgeGraphRelation,
    KBDocumentStatusEnum,
    KDocumentSourceType,
    KnowledgeGraphEntityChunksQuery,
    KnowledgeDocumentMetadata,
    KnowledgeGraphStatus,
    KnowledgeGraphStatusResponse,
    KnowledgeGraphViewResponse,
    KnowledgeGraphVisualizationQuery,
    XpertResolvedViewHostContext,
    XpertViewQuery
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { In, ILike, IsNull, Raw } from 'typeorm'
import { GetKnowledgebaseDocumentStatusCommand, UploadKnowledgebaseDocumentFileCommand } from '../../commands'
import { KnowledgeSearchQuery } from '../../queries'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { resolveKnowledgeDocumentParserConfig } from '../../../knowledge-document/parser-config'
import { KnowledgeGraphNodeDetailQuery, KnowledgeGraphViewQuery } from '../../../graphrag/queries'
import { addKnowledgebaseCitationLink } from '../../citation'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DEFAULT_PREVIEW_CHUNK_LIMIT = 6
const DEFAULT_SEARCH_TOP_K = 6
const MAX_SEARCH_TOP_K = 20
const DEFAULT_GRAPH_NODE_EVIDENCE_LIMIT = 6
const MAX_GRAPH_NODE_EVIDENCE_LIMIT = 20
const DEFAULT_GRAPH_NODE_MENTION_LIMIT = 3
const MAX_GRAPH_NODE_MENTION_LIMIT = 10
const DEFAULT_GRAPH_NODE_NEIGHBOR_HOPS = 1
const MAX_GRAPH_NODE_NEIGHBOR_HOPS = 2

export type KnowledgeWorkbenchKnowledgebaseRow = {
    id: string
    name?: string
    description?: string
    avatar?: unknown
    documentNum?: number
    tokenNum?: number
    chunkNum?: number
    graphEnabled?: boolean
    graphStatus?: KnowledgeGraphStatus | null
    graphRevision?: number | null
    graphIndexError?: string | null
}

// Export the server-side document status as the workbench API contract instead of duplicating strings in the UI.
export type KnowledgeWorkbenchDocumentStatus = KBDocumentStatusEnum

export type KnowledgeWorkbenchDocumentRow = {
    id: string
    knowledgebaseId?: string
    name?: string
    sourceType?: string | null
    type?: string | null
    category?: string | null
    filePath?: string | null
    fileUrl?: string | null
    mimeType?: string | null
    size?: string | number | null
    folder?: string | null
    status?: KnowledgeWorkbenchDocumentStatus | null
    progress?: number | null
    processMsg?: string | null
    tokenNum?: number | null
    chunkNum?: number | null
    disabled?: boolean | null
    updatedAt?: Date | string | null
    createdAt?: Date | string | null
    metadata?: unknown
    isFolder: boolean
}

export type KnowledgeWorkbenchBreadcrumbItem = {
    id: string
    name?: string
}

export type KnowledgeWorkbenchChunkPreview = {
    id?: string
    chunkId?: string
    documentId?: string
    pageContent: string
    chunkIndex?: number
    page?: number | string | null
    parentId?: string | null
    metadata?: unknown
}

export type KnowledgeWorkbenchDocumentPreview = {
    document: KnowledgeWorkbenchDocumentRow
    chunks: KnowledgeWorkbenchChunkPreview[]
    totalChunks: number
    transformedPreview?: KnowledgeWorkbenchChunkPreview[]
    originalFile?: {
        name?: string
        url?: string
        mimeType?: string | null
        size?: string | number | null
    }
}

export type KnowledgeWorkbenchCitation = {
    index: number
    chunkId?: string
    documentId?: string
    knowledgebaseId?: string
    documentName?: string
    fileUrl?: string
    mimeType?: string
    score?: number
    relevanceScore?: number
    snippet: string
    metadata?: unknown
    citationLabel?: string
    citationUrl?: string
    citationMarkdown?: string
}

export type KnowledgeWorkbenchSearchResult = {
    query: string
    knowledgebaseId: string
    documentIds?: string[]
    chunks: KnowledgeWorkbenchCitation[]
    citations: KnowledgeWorkbenchCitation[]
    message: string
}

export type KnowledgeWorkbenchGraphSummary = {
    enabled: boolean
    status: KnowledgeGraphStatus
    revision?: number | null
    error?: string | null
    entityCount: number
    relationCount: number
    mentionCount: number
    queuedJobCount?: number
    runningJobCount?: number
    failedJobCount?: number
    nodes: KnowledgeGraphViewResponse['nodes']
    edges: KnowledgeGraphViewResponse['edges']
    entityTypes: string[]
    relationTypes: string[]
    totalNodes: number
    totalEdges: number
    unavailable?: boolean
}

export type KnowledgeWorkbenchGraphEntityDetail = KnowledgeGraphViewResponse['nodes'][number] & {
    aliases?: string[] | null
    description?: string | null
    summary?: string | null
    revision?: number | null
    metadata?: unknown
}

export type KnowledgeWorkbenchGraphRelationDetail = KnowledgeGraphViewResponse['edges'][number] & {
    description?: string | null
    confidence?: number | null
    sourceName?: string
    sourceType?: string
    targetName?: string
    targetType?: string
}

export type KnowledgeWorkbenchGraphEvidenceMention = {
    id?: string
    entityId?: string
    relationId?: string | null
    documentId?: string
    chunkId?: string
    quote?: string | null
    confidence?: number | null
}

export type KnowledgeWorkbenchGraphEvidenceChunk = KnowledgeWorkbenchCitation & {
    pageContent: string
    chunkIndex?: number
    page?: number | string | null
    evidence: KnowledgeWorkbenchGraphEvidenceMention[]
}

export type KnowledgeWorkbenchGraphNodeDetail = {
    entity: KnowledgeWorkbenchGraphEntityDetail
    relations: KnowledgeWorkbenchGraphRelationDetail[]
    connectedEntities: KnowledgeWorkbenchGraphEntityDetail[]
    chunks: KnowledgeWorkbenchGraphEvidenceChunk[]
    evidenceByChunkId: Record<string, KnowledgeWorkbenchGraphEvidenceMention[]>
    totals: {
        chunks: number
        mentions: number
        entityIds: number
        relations: number
    }
    truncated?: {
        chunks?: boolean
        mentions?: boolean
    }
}

export type KnowledgeWorkbenchViewSummary = {
    knowledgebases: KnowledgeWorkbenchKnowledgebaseRow[]
    activeKnowledgebaseId?: string
    breadcrumb: KnowledgeWorkbenchBreadcrumbItem[]
    selectedDocument?: KnowledgeWorkbenchDocumentPreview
    graph?: KnowledgeWorkbenchGraphSummary
    graphNodeDetail?: KnowledgeWorkbenchGraphNodeDetail
}

@Injectable()
export class KnowledgeWorkbenchService {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    async getViewData(context: XpertResolvedViewHostContext, query: XpertViewQuery) {
        const allowedKnowledgebaseIds = getConnectedKnowledgebaseIds(context)
        const knowledgebases = await this.listKnowledgebases(allowedKnowledgebaseIds)
        const requestedKnowledgebaseId = getStringInput(query.parameters, 'knowledgebaseId')
        const activeKnowledgebaseId = this.resolveKnowledgebaseId(requestedKnowledgebaseId, allowedKnowledgebaseIds)

        if (!activeKnowledgebaseId) {
            return {
                items: [],
                total: 0,
                summary: {
                    knowledgebases,
                    breadcrumb: []
                } satisfies KnowledgeWorkbenchViewSummary
            }
        }

        const parentId = getStringInput(query.parameters, 'parentId')
        const documentId = getStringInput(query.parameters, 'documentId')
        const chunkId = getStringInput(query.parameters, 'chunkId')
        const table = getStringInput(query.parameters, 'table')
        if (table === 'graph') {
            return {
                items: [],
                total: 0,
                summary: {
                    knowledgebases,
                    activeKnowledgebaseId,
                    breadcrumb: [],
                    graph: await this.getGraphSummary({
                        allowedKnowledgebaseIds,
                        knowledgebaseId: activeKnowledgebaseId,
                        search: query.search,
                        entityType: getStringInput(query.parameters, 'entityType'),
                        relationType: getStringInput(query.parameters, 'relationType'),
                        focusEntityId: getStringInput(query.parameters, 'focusEntityId'),
                        take: getNumberInput(query.parameters, 'take')
                    })
                } satisfies KnowledgeWorkbenchViewSummary
            }
        }
        if (table === 'graph-node-detail') {
            return {
                items: [],
                total: 0,
                summary: {
                    knowledgebases,
                    activeKnowledgebaseId,
                    breadcrumb: [],
                    graphNodeDetail: await this.getGraphNodeDetail({
                        allowedKnowledgebaseIds,
                        knowledgebaseId: activeKnowledgebaseId,
                        entityId: getStringInput(query.parameters, 'entityId'),
                        neighborHops: getNumberInput(query.parameters, 'neighborHops'),
                        take: getNumberInput(query.parameters, 'take'),
                        mentionTake: getNumberInput(query.parameters, 'mentionTake')
                    })
                } satisfies KnowledgeWorkbenchViewSummary
            }
        }

        const page = normalizePage(query.page)
        const pageSize = normalizePageSize(query.pageSize)
        const { items, total, breadcrumb } = await this.listDocuments({
            allowedKnowledgebaseIds,
            knowledgebaseId: activeKnowledgebaseId,
            parentId,
            search: query.search,
            page,
            pageSize
        })

        const selectedDocument = documentId
            ? await this.getDocumentPreview(documentId, allowedKnowledgebaseIds, chunkId).catch(() => undefined)
            : undefined

        return {
            items,
            total,
            summary: {
                knowledgebases,
                activeKnowledgebaseId,
                breadcrumb,
                ...(selectedDocument ? { selectedDocument } : {})
            } satisfies KnowledgeWorkbenchViewSummary
        }
    }

    async listKnowledgebases(allowedKnowledgebaseIds: string[]): Promise<KnowledgeWorkbenchKnowledgebaseRow[]> {
        if (!allowedKnowledgebaseIds.length) {
            return []
        }

        const result = await this.knowledgebaseService.findAll({
            where: {
                id: In(allowedKnowledgebaseIds)
            },
            order: {
                updatedAt: 'DESC'
            } as any
        })

        return result.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            avatar: item.avatar,
            documentNum: item.documentNum,
            tokenNum: item.tokenNum,
            chunkNum: item.chunkNum,
            graphEnabled: item.graphRag?.enabled === true,
            graphStatus: item.graphStatus ?? null,
            graphRevision: item.graphRevision ?? null,
            graphIndexError: item.graphIndexError ?? null
        }))
    }

    async getGraphSummary(input: {
        allowedKnowledgebaseIds: string[]
        knowledgebaseId?: string
        search?: string
        entityType?: string
        relationType?: string
        focusEntityId?: string
        take?: number
    }): Promise<KnowledgeWorkbenchGraphSummary> {
        const knowledgebaseId = await this.assertKnowledgebaseAllowed(
            input.knowledgebaseId,
            input.allowedKnowledgebaseIds
        )
        const knowledgebase = await this.getKnowledgebaseInScope(knowledgebaseId)
        const fallbackStatus = knowledgebase?.graphStatus ?? KnowledgeGraphStatus.DISABLED
        const fallback = {
            enabled: knowledgebase?.graphRag?.enabled === true,
            status: fallbackStatus,
            revision: knowledgebase?.graphRevision ?? 0,
            error: knowledgebase?.graphIndexError ?? null,
            entityCount: 0,
            relationCount: 0,
            mentionCount: 0,
            nodes: [],
            edges: [],
            entityTypes: [],
            relationTypes: [],
            totalNodes: 0,
            totalEdges: 0
        } satisfies KnowledgeWorkbenchGraphSummary

        if (!fallback.enabled) {
            return fallback
        }

        try {
            const result = await this.queryBus.execute<
                KnowledgeGraphViewQuery,
                {
                    status: KnowledgeGraphStatusResponse
                    visualization: KnowledgeGraphViewResponse
                }
            >(
                new KnowledgeGraphViewQuery({
                    knowledgebaseId,
                    query: compactRecord({
                        search: input.search,
                        entityType: input.entityType,
                        relationType: input.relationType,
                        focusEntityId: input.focusEntityId,
                        take: input.take ?? 80
                    }) as KnowledgeGraphVisualizationQuery
                })
            )

            return {
                enabled: result.status.enabled,
                status: result.status.status,
                revision: result.status.revision,
                error: result.status.error,
                entityCount: result.status.entityCount,
                relationCount: result.status.relationCount,
                mentionCount: result.status.mentionCount,
                queuedJobCount: result.status.queuedJobCount,
                runningJobCount: result.status.runningJobCount,
                failedJobCount: result.status.failedJobCount,
                nodes: result.visualization.nodes,
                edges: result.visualization.edges,
                entityTypes: result.visualization.entityTypes,
                relationTypes: result.visualization.relationTypes,
                totalNodes: result.visualization.totalNodes,
                totalEdges: result.visualization.totalEdges
            }
        } catch (error) {
            return {
                ...fallback,
                unavailable: true,
                error: error instanceof Error ? error.message : String(error || 'Knowledge graph is unavailable')
            }
        }
    }

    async getGraphNodeDetail(input: {
        allowedKnowledgebaseIds: string[]
        knowledgebaseId?: string
        entityId?: string
        neighborHops?: number
        take?: number
        mentionTake?: number
    }): Promise<KnowledgeWorkbenchGraphNodeDetail> {
        const knowledgebaseId = await this.assertKnowledgebaseAllowed(
            input.knowledgebaseId,
            input.allowedKnowledgebaseIds
        )
        const entityId = getString(input.entityId)
        if (!entityId) {
            throw new BadRequestException('entityId is required')
        }
        const knowledgebase = await this.getKnowledgebaseInScope(knowledgebaseId)
        if (knowledgebase?.graphRag?.enabled !== true) {
            throw new BadRequestException('GraphRAG is not enabled for the selected knowledgebase')
        }

        const result = await this.queryBus.execute<
            KnowledgeGraphNodeDetailQuery,
            {
                entity: IKnowledgeGraphEntity
                relations: IKnowledgeGraphRelation[]
                connectedEntities: IKnowledgeGraphEntity[]
                chunks: IKnowledgeDocumentChunk[]
                evidenceByChunkId: Record<string, IKnowledgeGraphMention[]>
                totals: KnowledgeWorkbenchGraphNodeDetail['totals']
                truncated?: KnowledgeWorkbenchGraphNodeDetail['truncated']
            }
        >(
            new KnowledgeGraphNodeDetailQuery({
                knowledgebaseId,
                entityId,
                query: {
                    neighborHops: clampNumberInput(
                        input.neighborHops,
                        DEFAULT_GRAPH_NODE_NEIGHBOR_HOPS,
                        0,
                        MAX_GRAPH_NODE_NEIGHBOR_HOPS
                    ),
                    take: clampNumberInput(
                        input.take,
                        DEFAULT_GRAPH_NODE_EVIDENCE_LIMIT,
                        1,
                        MAX_GRAPH_NODE_EVIDENCE_LIMIT
                    ),
                    includeMentions: true,
                    mentionTake: clampNumberInput(
                        input.mentionTake,
                        DEFAULT_GRAPH_NODE_MENTION_LIMIT,
                        1,
                        MAX_GRAPH_NODE_MENTION_LIMIT
                    )
                } satisfies KnowledgeGraphEntityChunksQuery
            })
        )
        const connectedEntityById = new Map(
            result.connectedEntities.map((entity) => [entity.id, toGraphEntityDetail(entity)])
        )
        const evidenceByChunkId = mapEvidenceByChunkId(result.evidenceByChunkId)

        return {
            entity: toGraphEntityDetail(result.entity),
            relations: result.relations.map((relation) =>
                toGraphRelationDetail(relation, result.entity.id, connectedEntityById)
            ),
            connectedEntities: Array.from(connectedEntityById.values()),
            // The graph node itself is derived; chunks remain the auditable evidence and keep the normal citation URL.
            chunks: result.chunks.map((chunk, index) =>
                toGraphEvidenceChunk(chunk, evidenceByChunkId, index + 1, knowledgebaseId)
            ),
            evidenceByChunkId,
            totals: result.totals,
            ...(result.truncated ? { truncated: result.truncated } : {})
        }
    }

    async listDocuments(input: {
        allowedKnowledgebaseIds: string[]
        knowledgebaseId?: string
        parentId?: string
        search?: string
        page?: number
        pageSize?: number
    }): Promise<{
        items: KnowledgeWorkbenchDocumentRow[]
        total: number
        breadcrumb: KnowledgeWorkbenchBreadcrumbItem[]
    }> {
        const knowledgebaseId = await this.assertKnowledgebaseAllowed(
            input.knowledgebaseId,
            input.allowedKnowledgebaseIds
        )

        let parent: IKnowledgeDocument | null = null
        if (input.parentId) {
            parent = await this.findDocumentInScope(input.parentId, input.allowedKnowledgebaseIds)
            if (parent.knowledgebaseId !== knowledgebaseId) {
                throw new BadRequestException('Parent folder is not in the selected knowledgebase')
            }
            if (!isFolderDocument(parent)) {
                throw new BadRequestException('parentId must point to a folder document')
            }
        }

        const page = normalizePage(input.page)
        const pageSize = normalizePageSize(input.pageSize)
        const search = input.search?.trim()
        const where = {
            knowledgebaseId,
            parent: parent ? ({ id: parent.id } as IKnowledgeDocument) : IsNull(),
            ...(search ? { name: ILike(`%${escapeLike(search)}%`) } : {})
        } as any
        const result = await this.documentService.findAll({
            where,
            relations: ['parent'],
            order: {
                sourceType: 'ASC',
                updatedAt: 'DESC'
            } as any,
            skip: (page - 1) * pageSize,
            take: pageSize
        })

        return {
            items: result.items.map(toDocumentRow),
            total: result.total,
            breadcrumb: await this.getBreadcrumb(parent?.id)
        }
    }

    async getDocumentPreview(documentId: string, allowedKnowledgebaseIds: string[], targetChunkId?: string) {
        const document = await this.findDocumentInScope(documentId, allowedKnowledgebaseIds)
        const chunksResult = await this.documentService.getChunks(document.id, {
            skip: 0,
            take: DEFAULT_PREVIEW_CHUNK_LIMIT
        } as any)

        const chunks = normalizeChunkPage(chunksResult)
        if (
            targetChunkId &&
            !chunks.items.some(
                (chunk) => chunk.id === targetChunkId || getStringField(chunk.metadata, 'chunkId') === targetChunkId
            )
        ) {
            const targetResult = await this.documentService.getChunks(document.id, {
                skip: 0,
                take: 1,
                filter: {
                    metadata: Raw((alias) => `${alias} ->> 'chunkId' = :targetChunkId`, { targetChunkId })
                }
            } as any)
            const targetChunk = normalizeChunkPage(targetResult).items[0]
            if (targetChunk) {
                chunks.items.push(targetChunk)
            }
        }
        const previewChunks = sortChunksByDocumentOrder(chunks.items)
        const transformedPreview = await this.documentService
            .previewFile(document.id)
            .then((docs) =>
                docs.slice(0, 3).map((doc, index) => ({
                    id: `${document.id}:preview:${index}`,
                    documentId: document.id,
                    pageContent: trimSnippet(doc.pageContent, 2400),
                    chunkIndex: getNumberField(doc.metadata, 'chunkIndex'),
                    page: getChunkPage(doc.metadata),
                    parentId: getStringField(doc.metadata, 'parentId') ?? null,
                    metadata: doc.metadata
                }))
            )
            .catch(() => undefined)

        return {
            document: toDocumentRow(document),
            chunks: previewChunks.map((chunk) => ({
                id: chunk.id,
                chunkId: getStringField(chunk.metadata, 'chunkId') ?? chunk.id,
                documentId: chunk.documentId ?? document.id,
                pageContent: trimSnippet(chunk.pageContent, 2400),
                chunkIndex: getNumberField(chunk.metadata, 'chunkIndex'),
                page: getChunkPage(chunk.metadata),
                parentId: getChunkParentId(chunk),
                metadata: chunk.metadata
            })),
            totalChunks: chunks.total,
            ...(transformedPreview?.length ? { transformedPreview } : {}),
            ...(!isFolderDocument(document) && document.fileUrl
                ? {
                      originalFile: {
                          name: document.name,
                          url: document.fileUrl,
                          mimeType: document.mimeType,
                          size: document.size
                      }
                  }
                : {})
        } satisfies KnowledgeWorkbenchDocumentPreview
    }

    async searchDocuments(input: {
        tenantId: string
        organizationId?: string | null
        allowedKnowledgebaseIds: string[]
        query: string
        knowledgebaseId?: string
        documentIds?: string[]
        topK?: number
    }): Promise<KnowledgeWorkbenchSearchResult> {
        const knowledgebaseId = await this.assertKnowledgebaseAllowed(
            input.knowledgebaseId,
            input.allowedKnowledgebaseIds
        )
        const documentIds = uniqueStrings(input.documentIds)
        if (documentIds.length) {
            const documents = await this.findDocumentsInScope(documentIds, [knowledgebaseId])
            const foundIds = new Set(documents.map((document) => document.id))
            const missingId = documentIds.find((id) => !foundIds.has(id))
            if (missingId) {
                throw new BadRequestException(`Document '${missingId}' is not available in the selected knowledgebase`)
            }
        }

        const topK = Math.min(Math.max(input.topK ?? DEFAULT_SEARCH_TOP_K, 1), MAX_SEARCH_TOP_K)
        const queries = documentIds.length
            ? documentIds.map((documentId) => ({ filter: { documentId } as KnowledgeDocumentMetadata }))
            : [{ filter: undefined as KnowledgeDocumentMetadata | undefined }]

        const docs: DocumentInterface<DocumentMetadata>[] = []
        for (const query of queries) {
            docs.push(
                ...(await this.queryBus.execute<KnowledgeSearchQuery, DocumentInterface<DocumentMetadata>[]>(
                    new KnowledgeSearchQuery({
                        tenantId: input.tenantId,
                        organizationId: input.organizationId ?? null,
                        knowledgebases: [knowledgebaseId],
                        query: input.query,
                        k: topK,
                        filter: query.filter,
                        source: KNOWLEDGE_WORKBENCH_SEARCH_SOURCE
                    })
                ))
            )
        }

        const citations = dedupeAndSortCitations(docs)
            .slice(0, topK)
            .map((citation, index) => addCitationLink({ ...citation, index: index + 1 }, knowledgebaseId))
        return {
            query: input.query,
            knowledgebaseId,
            ...(documentIds.length ? { documentIds } : {}),
            chunks: citations,
            citations,
            message:
                citations.length > 0
                    ? `Found ${citations.length} relevant chunk(s) in the selected knowledgebase documents.`
                    : 'No relevant chunks were found in the selected knowledgebase documents.'
        }
    }

    async uploadDocument(input: {
        allowedKnowledgebaseIds: string[]
        knowledgebaseId?: string
        parentId?: string
        file: {
            buffer: Buffer
            originalname?: string
            mimetype?: string
            size?: number
        }
        process?: boolean
    }) {
        const knowledgebaseId = await this.assertKnowledgebaseAllowed(
            input.knowledgebaseId,
            input.allowedKnowledgebaseIds
        )
        await this.knowledgebaseService.assertNotRebuilding(knowledgebaseId)
        const parent = input.parentId ? await this.findDocumentInScope(input.parentId, [knowledgebaseId]) : null
        if (parent && !isFolderDocument(parent)) {
            throw new BadRequestException('parentId must point to a folder document')
        }

        const uploaded = await this.commandBus.execute(
            new UploadKnowledgebaseDocumentFileCommand({
                knowledgebaseId,
                parentId: parent?.id,
                file: input.file
            })
        )
        const type = normalizeDocumentType(uploaded.name, uploaded.mimeType)
        const category = classificateDocumentCategory({ type } as Partial<IKnowledgeDocument>)
        const syncResult = await this.documentService.createDocumentWithIncrementalSync({
            knowledgebaseId,
            parent: parent ? ({ id: parent.id } as IKnowledgeDocument) : null,
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            name: uploaded.name,
            type,
            category,
            filePath: uploaded.filePath,
            fileUrl: uploaded.fileUrl,
            mimeType: uploaded.mimeType,
            size: String(uploaded.size ?? input.file.size ?? input.file.buffer.length),
            status: KBDocumentStatusEnum.WAITING,
            parserConfig: resolveKnowledgeDocumentParserConfig({ type, category }),
            sourceHash: uploaded.sourceHash,
            metadata: uploaded.sourceHash ? { sourceHash: uploaded.sourceHash } : undefined
        })
        const document = syncResult.document

        let documents = [document]
        let processingStarted = false
        if (input.process !== false && syncResult.shouldProcess) {
            documents = await this.documentService.startProcessing([document.id], knowledgebaseId)
            processingStarted = true
        }

        return {
            knowledgebaseId,
            document: toDocumentRow(documents[0] ?? document),
            documents: documents.map(toDocumentRow),
            uploaded,
            processingStarted
        }
    }

    async createFolder(input: {
        allowedKnowledgebaseIds: string[]
        knowledgebaseId?: string
        parentId?: string
        name?: string
    }) {
        const knowledgebaseId = await this.assertKnowledgebaseAllowed(
            input.knowledgebaseId,
            input.allowedKnowledgebaseIds
        )
        await this.knowledgebaseService.assertNotRebuilding(knowledgebaseId)
        const name = input.name?.trim()
        if (!name) {
            throw new BadRequestException('Folder name is required')
        }
        const parent = input.parentId ? await this.findDocumentInScope(input.parentId, [knowledgebaseId]) : null
        if (parent && !isFolderDocument(parent)) {
            throw new BadRequestException('parentId must point to a folder document')
        }
        const document = await this.documentService.createDocument({
            knowledgebaseId,
            parent: parent ? ({ id: parent.id } as IKnowledgeDocument) : null,
            sourceType: DocumentTypeEnum.FOLDER,
            type: DocumentTypeEnum.FOLDER,
            name
        })
        return {
            knowledgebaseId,
            document: toDocumentRow(document)
        }
    }

    async startProcessing(input: {
        allowedKnowledgebaseIds: string[]
        knowledgebaseId?: string
        documentIds?: string[]
    }) {
        const knowledgebaseId = await this.assertKnowledgebaseAllowed(
            input.knowledgebaseId,
            input.allowedKnowledgebaseIds
        )
        const documentIds = uniqueStrings(input.documentIds)
        if (!documentIds.length) {
            throw new BadRequestException('documentIds is required')
        }
        await this.findDocumentsInScope(documentIds, [knowledgebaseId])
        const result = await this.commandBus.execute(
            new GetKnowledgebaseDocumentStatusCommand({
                knowledgebaseId,
                documentIds
            })
        )
        const processableIds = result.documents
            .filter((document) => document.sourceType !== KDocumentSourceType.FOLDER)
            .map((document) => document.id)
        const documents = processableIds.length
            ? await this.documentService.startProcessing(processableIds, knowledgebaseId)
            : []
        return {
            knowledgebaseId,
            documents: documents.map(toDocumentRow)
        }
    }

    resolveKnowledgebaseId(knowledgebaseId: string | undefined, allowedKnowledgebaseIds: string[]) {
        if (!allowedKnowledgebaseIds.length) {
            return undefined
        }
        if (knowledgebaseId) {
            return allowedKnowledgebaseIds.includes(knowledgebaseId) ? knowledgebaseId : undefined
        }
        return allowedKnowledgebaseIds[0]
    }

    private async assertKnowledgebaseAllowed(knowledgebaseId: string | undefined, allowedKnowledgebaseIds: string[]) {
        const resolved = this.resolveKnowledgebaseId(knowledgebaseId, allowedKnowledgebaseIds)
        if (!resolved) {
            throw new BadRequestException('The selected knowledgebase is not connected to the current agent')
        }
        return resolved
    }

    private async findDocumentInScope(documentId: string, allowedKnowledgebaseIds: string[]) {
        const documents = await this.findDocumentsInScope([documentId], allowedKnowledgebaseIds)
        const document = documents[0]
        if (!document) {
            throw new NotFoundException(`Knowledge document '${documentId}' was not found`)
        }
        return document
    }

    private async findDocumentsInScope(documentIds: string[], allowedKnowledgebaseIds: string[]) {
        if (!allowedKnowledgebaseIds.length || !documentIds.length) {
            return []
        }
        const result = await this.documentService.findAll({
            where: {
                id: In(uniqueStrings(documentIds)),
                knowledgebaseId: In(allowedKnowledgebaseIds)
            },
            relations: ['parent']
        })
        return result.items
    }

    private async getKnowledgebaseInScope(knowledgebaseId: string) {
        const result = await this.knowledgebaseService.findAll({
            where: {
                id: knowledgebaseId
            },
            take: 1
        } as any)
        return result.items[0]
    }

    private async getBreadcrumb(parentId?: string) {
        if (!parentId) {
            return []
        }
        const ancestors = await this.documentService.findAncestors(parentId)
        return ancestors.filter(isFolderDocument).map((item) => ({
            id: item.id,
            name: item.name
        }))
    }
}

const KNOWLEDGE_WORKBENCH_SEARCH_SOURCE = 'knowledgebase-workbench'

export function getConnectedKnowledgebaseIds(context: Pick<XpertResolvedViewHostContext, 'hostState'>) {
    const connections = getRecord(getRecord(context.hostState)?.agent)?.connections
    if (!Array.isArray(connections)) {
        return []
    }

    return uniqueStrings(
        connections
            .map((connection) => {
                if (!connection || typeof connection !== 'object') {
                    return undefined
                }
                const record = connection as Record<string, unknown>
                return record.type === 'knowledgebase' ? getString(record.id) : undefined
            })
            .filter(Boolean) as string[]
    )
}

export function toDocumentRow(document: Partial<IKnowledgeDocument>): KnowledgeWorkbenchDocumentRow {
    return {
        id: document.id,
        knowledgebaseId: document.knowledgebaseId,
        name: document.name,
        sourceType: document.sourceType ?? null,
        type: document.type ?? null,
        category: document.category ?? null,
        filePath: document.filePath ?? null,
        fileUrl: document.fileUrl ?? null,
        mimeType: document.mimeType ?? null,
        size: document.size ?? null,
        folder: document.folder ?? null,
        status: document.status ?? null,
        progress: document.progress ?? null,
        processMsg: document.processMsg ?? null,
        tokenNum: document.tokenNum ?? null,
        chunkNum: document.chunkNum ?? null,
        disabled: document.disabled ?? null,
        updatedAt: document.updatedAt,
        createdAt: document.createdAt,
        metadata: document.metadata,
        isFolder: isFolderDocument(document)
    }
}

function normalizeChunkPage(value: unknown): {
    items: Array<KnowledgeWorkbenchChunkPreview & { id?: string }>
    total: number
} {
    if (Array.isArray(value)) {
        return {
            items: value as Array<KnowledgeWorkbenchChunkPreview & { id?: string }>,
            total: value.length
        }
    }
    const record = getRecord(value)
    const items = Array.isArray(record?.items) ? record.items : []
    const total = typeof record?.total === 'number' ? record.total : items.length
    return {
        items: items as Array<KnowledgeWorkbenchChunkPreview & { id?: string }>,
        total
    }
}

function sortChunksByDocumentOrder<T extends { metadata?: unknown }>(chunks: T[]) {
    return chunks
        .map((chunk, index) => ({ chunk, index, chunkIndex: getNumberField(chunk.metadata, 'chunkIndex') }))
        .sort((left, right) => {
            if (
                left.chunkIndex !== undefined &&
                right.chunkIndex !== undefined &&
                left.chunkIndex !== right.chunkIndex
            ) {
                return left.chunkIndex - right.chunkIndex
            }
            if (left.chunkIndex !== undefined || right.chunkIndex !== undefined) {
                return left.chunkIndex !== undefined ? -1 : 1
            }
            return left.index - right.index
        })
        .map(({ chunk }) => chunk)
}

function getChunkParentId(chunk: Pick<KnowledgeWorkbenchChunkPreview, 'parentId' | 'metadata'>) {
    // New chunk rows may expose parentId directly, while older rows keep it in metadata.
    return getString(chunk.parentId) ?? getStringField(chunk.metadata, 'parentId') ?? null
}

function getChunkPage(metadata: unknown) {
    // Keep page available as a stable DTO field; metadata shapes vary across PDF, DOCX, and VLM chunks.
    return (
        getNumberOrStringField(metadata, 'page') ??
        getNumberOrStringField(metadata, 'pageNumber') ??
        getNumberOrStringField(metadata, 'pageNo') ??
        getNumberOrStringField(getRecord(metadata)?.loc, 'page') ??
        getNumberOrStringField(getRecord(metadata)?.loc, 'pageNumber') ??
        getNumberOrStringFieldFromAssets(metadata, 'page') ??
        null
    )
}

function toGraphEntityDetail(entity: IKnowledgeGraphEntity): KnowledgeWorkbenchGraphEntityDetail {
    const value = entity.mentionCount ?? 0
    return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        origin: entity.origin ?? 'extracted',
        visibility: entity.visibility ?? 'active',
        mentionCount: value,
        confidence: entity.confidence ?? null,
        value,
        symbolSize: Math.min(54, Math.max(22, 22 + value * 2)),
        aliases: entity.aliases ?? [],
        description: entity.description ?? null,
        summary: entity.summary ?? null,
        revision: entity.revision ?? null,
        metadata: entity.metadata ?? null
    }
}

function toGraphRelationDetail(
    relation: IKnowledgeGraphRelation,
    focusedEntityId: string,
    connectedEntityById: Map<string, KnowledgeWorkbenchGraphEntityDetail>
): KnowledgeWorkbenchGraphRelationDetail {
    const source = getString(relation.sourceEntityId) ?? getString(relation.sourceEntity?.id) ?? ''
    const target = getString(relation.targetEntityId) ?? getString(relation.targetEntity?.id) ?? ''
    const sourceDetail = source === focusedEntityId ? relation.sourceEntity : connectedEntityById.get(source)
    const targetDetail = target === focusedEntityId ? relation.targetEntity : connectedEntityById.get(target)

    return {
        id: relation.id,
        source,
        target,
        type: relation.type,
        origin: relation.origin ?? 'extracted',
        visibility: relation.visibility ?? 'active',
        weight: relation.weight ?? null,
        evidenceCount: relation.evidenceCount ?? 0,
        description: relation.description ?? null,
        confidence: relation.confidence ?? null,
        sourceName: sourceDetail?.name,
        sourceType: sourceDetail?.type,
        targetName: targetDetail?.name,
        targetType: targetDetail?.type
    }
}

function mapEvidenceByChunkId(input: Record<string, IKnowledgeGraphMention[]>) {
    const result: Record<string, KnowledgeWorkbenchGraphEvidenceMention[]> = {}
    for (const [chunkId, mentions] of Object.entries(input ?? {})) {
        result[chunkId] = mentions.map(toGraphEvidenceMention)
    }
    return result
}

function toGraphEvidenceMention(mention: IKnowledgeGraphMention): KnowledgeWorkbenchGraphEvidenceMention {
    return {
        id: mention.id,
        entityId: mention.entityId,
        relationId: mention.relationId ?? null,
        documentId: mention.documentId,
        chunkId: mention.chunkId,
        quote: mention.quote ?? null,
        confidence: mention.confidence ?? null
    }
}

function toGraphEvidenceChunk(
    chunk: IKnowledgeDocumentChunk,
    evidenceByChunkId: Record<string, KnowledgeWorkbenchGraphEvidenceMention[]>,
    index: number,
    fallbackKnowledgebaseId: string
): KnowledgeWorkbenchGraphEvidenceChunk {
    const metadata = getRecord(chunk.metadata) ?? {}
    const chunkId = getString(metadata.chunkId) ?? getString(chunk.id)
    const documentId =
        getString(chunk.documentId) ??
        getString(metadata.documentId) ??
        getString(metadata.knowledgeId) ??
        getString(chunk.document?.id)
    const score = getNumber(metadata.score)
    const relevanceScore = getNumber(metadata.relevanceScore)
    const citation = addCitationLink(
        {
            index,
            ...(chunkId ? { chunkId } : {}),
            ...(documentId ? { documentId } : {}),
            knowledgebaseId: getString(chunk.knowledgebaseId),
            documentName:
                getString(chunk.document?.name) ??
                getString(metadata.title) ??
                getString(metadata.originalFileName) ??
                getString(metadata.filename),
            fileUrl: getString(chunk.document?.fileUrl) ?? getString(metadata.fileUrl),
            mimeType: getString(chunk.document?.mimeType) ?? getString(metadata.mimeType),
            ...(score !== undefined ? { score } : {}),
            ...(relevanceScore !== undefined ? { relevanceScore } : {}),
            snippet: trimSnippet(chunk.pageContent, 1200),
            metadata
        },
        fallbackKnowledgebaseId
    )

    return {
        ...citation,
        page: getChunkPage(metadata),
        pageContent: trimSnippet(chunk.pageContent, 1600),
        chunkIndex: getNumberField(metadata, 'chunkIndex'),
        evidence: chunkId ? (evidenceByChunkId[chunkId] ?? []) : []
    }
}

function dedupeAndSortCitations(docs: DocumentInterface<DocumentMetadata>[]): KnowledgeWorkbenchCitation[] {
    const byChunk = new Map<string, KnowledgeWorkbenchCitation>()
    for (const doc of docs) {
        const citation = toCitation(doc, byChunk.size + 1)
        const key = citation.chunkId ?? `${citation.documentId ?? 'document'}:${citation.snippet}`
        const current = byChunk.get(key)
        if (
            !current ||
            (citation.relevanceScore ?? citation.score ?? 0) > (current.relevanceScore ?? current.score ?? 0)
        ) {
            byChunk.set(key, citation)
        }
    }

    return Array.from(byChunk.values())
        .sort((left, right) => (right.relevanceScore ?? right.score ?? 0) - (left.relevanceScore ?? left.score ?? 0))
        .map((citation, index) => ({ ...citation, index: index + 1 }))
}

function toCitation(doc: DocumentInterface<DocumentMetadata>, index: number): KnowledgeWorkbenchCitation {
    const metadata = getRecord(doc.metadata) ?? {}
    const relationDocument = getRecord((doc as unknown as { document?: unknown }).document)
    const documentId =
        getString(metadata.documentId) ?? getString(metadata.knowledgeId) ?? getString(relationDocument?.id)
    const chunkId = getString(metadata.chunkId) ?? getString((doc as unknown as { id?: unknown }).id)
    const score = getNumber(metadata.score)
    const relevanceScore = getNumber(metadata.relevanceScore)

    return {
        index,
        ...(chunkId ? { chunkId } : {}),
        ...(documentId ? { documentId } : {}),
        knowledgebaseId: getString(metadata.knowledgebaseId),
        documentName: getString(relationDocument?.name) ?? getString(metadata.title),
        fileUrl: getString(relationDocument?.fileUrl) ?? getString(metadata.fileUrl),
        mimeType: getString(relationDocument?.mimeType) ?? getString(metadata.mimeType),
        ...(score !== undefined ? { score } : {}),
        ...(relevanceScore !== undefined ? { relevanceScore } : {}),
        snippet: trimSnippet(doc.pageContent, 1200),
        metadata
    }
}

function addCitationLink(
    citation: KnowledgeWorkbenchCitation,
    fallbackKnowledgebaseId: string
): KnowledgeWorkbenchCitation {
    return addKnowledgebaseCitationLink(citation, fallbackKnowledgebaseId)
}

function isFolderDocument(document: Partial<IKnowledgeDocument> | null | undefined) {
    return document?.sourceType === KDocumentSourceType.FOLDER || document?.type === DocumentTypeEnum.FOLDER
}

function normalizeDocumentType(name?: string, mimeType?: string) {
    const extension = name?.split('.').pop()?.trim().toLowerCase()
    if (extension && extension !== name?.toLowerCase()) {
        return extension
    }
    if (mimeType?.includes('/')) {
        return mimeType.split('/').pop()?.split('+').shift()?.toLowerCase() || 'file'
    }
    return 'file'
}

function normalizePage(page?: number) {
    return Number.isFinite(page) && page && page > 0 ? Math.floor(page) : DEFAULT_PAGE
}

function normalizePageSize(pageSize?: number) {
    if (!Number.isFinite(pageSize) || !pageSize || pageSize <= 0) {
        return DEFAULT_PAGE_SIZE
    }
    return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE)
}

function clampNumberInput(value: number | undefined, fallback: number, min: number, max: number) {
    const resolved = Number.isFinite(value) ? value : fallback
    return Math.min(Math.max(Math.floor(resolved), min), max)
}

function uniqueStrings(values: Array<string | undefined | null> | undefined) {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values ?? []) {
        const normalized = typeof value === 'string' ? value.trim() : ''
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized)
            result.push(normalized)
        }
    }
    return result
}

function getStringInput(parameters: Record<string, unknown> | undefined, key: string) {
    const value = parameters?.[key]
    const normalized = Array.isArray(value) ? value[0] : value
    return getString(normalized)
}

function getNumberInput(parameters: Record<string, unknown> | undefined, key: string) {
    const value = parameters?.[key]
    const normalized = Array.isArray(value) ? value[0] : value
    if (typeof normalized === 'number' && Number.isFinite(normalized)) {
        return normalized
    }
    if (typeof normalized === 'string' && normalized.trim()) {
        const parsed = Number(normalized)
        return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
}

function getString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getStringField(value: unknown, key: string) {
    return getString(getRecord(value)?.[key])
}

function getNumberField(value: unknown, key: string) {
    return getNumber(getRecord(value)?.[key])
}

function getNumberOrStringField(value: unknown, key: string) {
    const field = getRecord(value)?.[key]
    return getNumber(field) ?? getString(field)
}

function getNumberOrStringFieldFromAssets(value: unknown, key: string) {
    const assets = getRecord(value)?.assets
    if (!Array.isArray(assets)) {
        return undefined
    }

    for (const asset of assets) {
        const field = getNumberOrStringField(asset, key)
        if (field !== undefined) {
            return field
        }
    }
    return undefined
}

function getNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function compactRecord(input: Record<string, unknown>) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== null && value !== '') {
            result[key] = value
        }
    }
    return result
}

function trimSnippet(value: unknown, maxLength: number) {
    const text = typeof value === 'string' ? value : ''
    return text.length > maxLength ? `${text.slice(0, maxLength)} ...` : text
}

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, (item) => `\\${item}`)
}
