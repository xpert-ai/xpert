import { DocumentInterface } from '@langchain/core/documents'
import {
    classificateDocumentCategory,
    DocumentMetadata,
    DocumentSourceProviderCategoryEnum,
    DocumentTypeEnum,
    IKnowledgeDocument,
    KBDocumentStatusEnum,
    KDocumentSourceType,
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
import { KnowledgeGraphViewQuery } from '../../../graphrag/queries'
import { addKnowledgebaseCitationLink } from '../../citation'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DEFAULT_PREVIEW_CHUNK_LIMIT = 6
const DEFAULT_SEARCH_TOP_K = 6
const MAX_SEARCH_TOP_K = 20

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
    status?: string | null
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

export type KnowledgeWorkbenchViewSummary = {
    knowledgebases: KnowledgeWorkbenchKnowledgebaseRow[]
    activeKnowledgebaseId?: string
    breadcrumb: KnowledgeWorkbenchBreadcrumbItem[]
    selectedDocument?: KnowledgeWorkbenchDocumentPreview
    graph?: KnowledgeWorkbenchGraphSummary
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
        if (getStringInput(query.parameters, 'table') === 'graph') {
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
        const transformedPreview = await this.documentService
            .previewFile(document.id)
            .then((docs) =>
                docs.slice(0, 3).map((doc, index) => ({
                    id: `${document.id}:preview:${index}`,
                    documentId: document.id,
                    pageContent: trimSnippet(doc.pageContent, 2400),
                    metadata: doc.metadata
                }))
            )
            .catch(() => undefined)

        return {
            document: toDocumentRow(document),
            chunks: chunks.items.map((chunk) => ({
                id: chunk.id,
                chunkId: getStringField(chunk.metadata, 'chunkId') ?? chunk.id,
                documentId: chunk.documentId ?? document.id,
                pageContent: trimSnippet(chunk.pageContent, 2400),
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
        const document = await this.documentService.createDocument({
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
            metadata: uploaded.sourceHash ? { sourceHash: uploaded.sourceHash } : undefined
        })

        let documents = [document]
        let processingStarted = false
        if (input.process !== false) {
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
