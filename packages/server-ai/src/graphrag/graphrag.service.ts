import { Document, DocumentInterface } from '@langchain/core/documents'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
    AiProviderRole,
    DocumentMetadata,
    GraphRagConfig,
    ICopilot,
    IKnowledgebase,
    IKnowledgeDocumentChunk,
    KDocumentSourceType,
    KnowledgeDocumentMetadata,
    KnowledgeGraphIndexJobStatus,
    KnowledgeGraphStatus,
    KnowledgeGraphStatusResponse,
    TWFCase
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { PaginationParams, RequestContext } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { compact, uniq } from 'lodash'
import { FindOptionsWhere, In, IsNull, Not, Raw, Repository } from 'typeorm'
import { z } from 'zod'
import { CopilotModelGetChatModelQuery } from '../copilot-model'
import { CopilotOneByRoleQuery } from '../copilot/queries'
import { KnowledgeDocumentChunkService } from '../knowledge-document/chunk/chunk.service'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'
import { TDocChunkMetadata } from '../knowledge-document/types'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { buildMetadataCondition } from '../knowledgebase/types'
import {
    KnowledgeGraphCommunity,
    KnowledgeGraphEntity,
    KnowledgeGraphIndexJob,
    KnowledgeGraphMention,
    KnowledgeGraphRelation
} from './entities'
import {
    JOB_KNOWLEDGE_GRAPH_INDEX,
    TKnowledgeGraphEnqueueInput,
    TKnowledgeGraphExtraction,
    TKnowledgeGraphExtractionEntity,
    TKnowledgeGraphExtractionRelation,
    TKnowledgeGraphIndexQueueJob,
    TKnowledgeGraphSearchInput,
    TKnowledgeGraphSearchResult
} from './types'

const DEFAULT_GRAPH_RAG_CONFIG: Required<GraphRagConfig> = {
    enabled: false,
    entityTopK: 8,
    neighborHops: 1,
    communityTopK: 0,
    graphWeight: 0.35,
    extractionBatchSize: 8,
    extractionMaxCharacters: 12000
}

const graphExtractionSchema = z.object({
    entities: z
        .array(
            z.object({
                name: z.string().min(1),
                type: z.string().min(1),
                aliases: z.array(z.string()).optional().nullable(),
                description: z.string().optional().nullable(),
                confidence: z.number().min(0).max(1).optional().nullable(),
                evidence: z
                    .array(
                        z.object({
                            chunkId: z.string().min(1),
                            quote: z.string().optional().nullable(),
                            confidence: z.number().min(0).max(1).optional().nullable()
                        })
                    )
                    .optional()
                    .nullable()
            })
        )
        .default([]),
    relations: z
        .array(
            z.object({
                sourceName: z.string().min(1),
                sourceType: z.string().min(1),
                targetName: z.string().min(1),
                targetType: z.string().min(1),
                type: z.string().min(1),
                description: z.string().optional().nullable(),
                confidence: z.number().min(0).max(1).optional().nullable(),
                evidence: z
                    .array(
                        z.object({
                            chunkId: z.string().min(1),
                            quote: z.string().optional().nullable(),
                            confidence: z.number().min(0).max(1).optional().nullable()
                        })
                    )
                    .optional()
                    .nullable()
            })
        )
        .default([])
})

function resolveGraphConfig(config?: GraphRagConfig | null): Required<GraphRagConfig> {
    return {
        ...DEFAULT_GRAPH_RAG_CONFIG,
        ...(config ?? {}),
        entityTopK: Math.max(1, config?.entityTopK ?? DEFAULT_GRAPH_RAG_CONFIG.entityTopK),
        neighborHops: Math.min(2, Math.max(1, config?.neighborHops ?? DEFAULT_GRAPH_RAG_CONFIG.neighborHops)),
        graphWeight: Math.min(1, Math.max(0, config?.graphWeight ?? DEFAULT_GRAPH_RAG_CONFIG.graphWeight)),
        extractionBatchSize: Math.max(1, config?.extractionBatchSize ?? DEFAULT_GRAPH_RAG_CONFIG.extractionBatchSize),
        extractionMaxCharacters: Math.max(
            1000,
            config?.extractionMaxCharacters ?? DEFAULT_GRAPH_RAG_CONFIG.extractionMaxCharacters
        )
    }
}

export function normalizeKnowledgeGraphName(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeKnowledgeGraphType(value: string) {
    return value.trim().replace(/\s+/g, '_').toLowerCase()
}

@Injectable()
export class GraphragService {
    private readonly logger = new Logger(GraphragService.name)

    constructor(
        @InjectRepository(KnowledgeGraphEntity)
        private readonly entityRepository: Repository<KnowledgeGraphEntity>,
        @InjectRepository(KnowledgeGraphRelation)
        private readonly relationRepository: Repository<KnowledgeGraphRelation>,
        @InjectRepository(KnowledgeGraphMention)
        private readonly mentionRepository: Repository<KnowledgeGraphMention>,
        @InjectRepository(KnowledgeGraphCommunity)
        private readonly communityRepository: Repository<KnowledgeGraphCommunity>,
        @InjectRepository(KnowledgeGraphIndexJob)
        private readonly jobRepository: Repository<KnowledgeGraphIndexJob>,
        @InjectRepository(Knowledgebase)
        private readonly knowledgebaseRepository: Repository<Knowledgebase>,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        private readonly chunkService: KnowledgeDocumentChunkService,
        private readonly queryBus: QueryBus,
        @InjectQueue(JOB_KNOWLEDGE_GRAPH_INDEX)
        private readonly graphQueue: Queue<TKnowledgeGraphIndexQueueJob>
    ) {}

    isEnabled(knowledgebase: Pick<IKnowledgebase, 'graphRag'> | null | undefined) {
        return knowledgebase?.graphRag?.enabled === true
    }

    async enqueueDocuments(input: TKnowledgeGraphEnqueueInput) {
        const documentIds = uniq(compact(input.documentIds))
        if (!documentIds.length) {
            return []
        }

        const knowledgebase = await this.knowledgebaseService.findOne(input.knowledgebaseId)
        if (!this.isEnabled(knowledgebase)) {
            return []
        }

        const revision = knowledgebase.graphRevision ?? 0
        await this.knowledgebaseRepository.update(knowledgebase.id, {
            graphStatus: KnowledgeGraphStatus.INDEXING,
            graphIndexError: null
        })

        const jobs: KnowledgeGraphIndexJob[] = []
        for (const documentId of documentIds) {
            const graphJob = await this.jobRepository.save(
                this.jobRepository.create({
                    tenantId: input.tenantId ?? knowledgebase.tenantId,
                    organizationId: input.organizationId ?? knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    documentId,
                    type: input.reason,
                    status: KnowledgeGraphIndexJobStatus.QUEUED,
                    revision,
                    processedChunks: 0,
                    totalChunks: 0
                })
            )
            await this.graphQueue.add({
                userId: input.userId ?? RequestContext.currentUserId(),
                tenantId: input.tenantId ?? knowledgebase.tenantId,
                organizationId: input.organizationId ?? knowledgebase.organizationId,
                knowledgebaseId: knowledgebase.id,
                graphIndexJobId: graphJob.id
            })
            jobs.push(graphJob)
        }

        return jobs
    }

    async clearDocument(knowledgebaseId: string, documentId: string) {
        const affectedMentions = await this.mentionRepository.find({
            where: {
                knowledgebaseId,
                documentId
            },
            select: {
                id: true,
                entityId: true,
                relationId: true
            }
        })
        const affectedEntityIds = uniq(compact(affectedMentions.map((mention) => mention.entityId)))
        const affectedRelationIds = uniq(compact(affectedMentions.map((mention) => mention.relationId)))

        await this.mentionRepository.delete({ knowledgebaseId, documentId })

        for (const relationId of affectedRelationIds) {
            const mentionCount = await this.mentionRepository.count({ where: { relationId } })
            if (!mentionCount) {
                await this.relationRepository.delete({ id: relationId })
            }
        }

        await this.pruneEntities(affectedEntityIds)
        await this.refreshEntityMentionCounts(knowledgebaseId, affectedEntityIds)
        await this.syncEntityVectors(knowledgebaseId).catch((error) => {
            this.logger.warn(`Failed to sync graph vectors after document cleanup: ${getErrorMessage(error)}`)
        })
    }

    async rebuildKnowledgebase(knowledgebaseId: string) {
        const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId)
        if (!this.isEnabled(knowledgebase)) {
            throw new BadRequestException('GraphRAG is disabled for this knowledgebase')
        }

        const revision = (knowledgebase.graphRevision ?? 0) + 1
        await this.clearKnowledgebase(knowledgebaseId)
        await this.knowledgebaseRepository.update(knowledgebaseId, {
            graphRevision: revision,
            graphStatus: KnowledgeGraphStatus.INDEXING,
            graphIndexError: null
        })

        const { items } = await this.documentService.findAll({
            where: {
                knowledgebaseId,
                sourceType: Not(KDocumentSourceType.FOLDER)
            }
        })

        return this.enqueueDocuments({
            userId: RequestContext.currentUserId(),
            tenantId: knowledgebase.tenantId,
            organizationId: knowledgebase.organizationId,
            knowledgebaseId,
            documentIds: items.map((document) => document.id),
            reason: 'rebuild'
        })
    }

    async clearKnowledgebase(knowledgebaseId: string) {
        await this.mentionRepository.delete({ knowledgebaseId })
        await this.relationRepository.delete({ knowledgebaseId })
        await this.entityRepository.delete({ knowledgebaseId })
        await this.communityRepository.delete({ knowledgebaseId })
        await this.jobRepository.delete({ knowledgebaseId })
        try {
            const vectorStore = await this.knowledgebaseService.getGraphEntityVectorStore(knowledgebaseId, false)
            await vectorStore.clear()
        } catch (error) {
            this.logger.warn(
                `Failed to clear graph entity vectors for knowledgebase '${knowledgebaseId}': ${getErrorMessage(error)}`
            )
        }
    }

    async getStatus(knowledgebaseId: string): Promise<KnowledgeGraphStatusResponse> {
        const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId)
        const enabled = this.isEnabled(knowledgebase)
        const [entityCount, relationCount, mentionCount, queuedJobCount, runningJobCount, failedJobCount, jobs] =
            await Promise.all([
                this.entityRepository.count({ where: { knowledgebaseId } }),
                this.relationRepository.count({ where: { knowledgebaseId } }),
                this.mentionRepository.count({ where: { knowledgebaseId } }),
                this.jobRepository.count({ where: { knowledgebaseId, status: KnowledgeGraphIndexJobStatus.QUEUED } }),
                this.jobRepository.count({ where: { knowledgebaseId, status: KnowledgeGraphIndexJobStatus.RUNNING } }),
                this.jobRepository.count({ where: { knowledgebaseId, status: KnowledgeGraphIndexJobStatus.FAILED } }),
                this.jobRepository.find({
                    where: { knowledgebaseId },
                    order: { updatedAt: 'DESC' },
                    take: 50
                })
            ])

        return {
            status: enabled ? (knowledgebase.graphStatus ?? KnowledgeGraphStatus.READY) : KnowledgeGraphStatus.DISABLED,
            enabled,
            revision: knowledgebase.graphRevision ?? 0,
            error: knowledgebase.graphIndexError ?? null,
            entityCount,
            relationCount,
            mentionCount,
            queuedJobCount,
            runningJobCount,
            failedJobCount,
            jobs
        }
    }

    async listEntities(knowledgebaseId: string, params?: PaginationParams<KnowledgeGraphEntity>) {
        const search = typeof params?.where?.['search'] === 'string' ? params.where['search'] : null
        const where = search
            ? [
                  {
                      knowledgebaseId,
                      name: Raw((alias) => `${alias} ILIKE :search`, { search: `%${search}%` })
                  },
                  {
                      knowledgebaseId,
                      type: Raw((alias) => `${alias} ILIKE :search`, { search: `%${search}%` })
                  }
              ]
            : { knowledgebaseId }

        const [items, total] = await this.entityRepository.findAndCount({
            where,
            order: params?.order ?? {
                mentionCount: 'DESC',
                updatedAt: 'DESC'
            },
            skip: params?.skip,
            take: params?.take
        })

        return { items, total }
    }

    async getNeighborhood(knowledgebaseId: string, entityId: string) {
        const entity = await this.entityRepository.findOne({ where: { id: entityId, knowledgebaseId } })
        if (!entity) {
            throw new NotFoundException(`Knowledge graph entity '${entityId}' not found`)
        }
        const relations = await this.relationRepository.find({
            where: [
                { knowledgebaseId, sourceEntityId: entityId },
                { knowledgebaseId, targetEntityId: entityId }
            ],
            relations: ['sourceEntity', 'targetEntity']
        })
        const connectedIds = uniq(
            relations
                .flatMap((relation) => [relation.sourceEntityId, relation.targetEntityId])
                .filter((id) => id && id !== entityId)
        )
        const connectedEntities = connectedIds.length
            ? await this.entityRepository.find({
                  where: {
                      knowledgebaseId,
                      id: In(connectedIds)
                  }
              })
            : []
        const mentions = await this.mentionRepository.find({
            where: { knowledgebaseId, entityId },
            order: { createdAt: 'DESC' },
            take: 20
        })
        return {
            entity,
            relations,
            connectedEntities,
            mentions
        }
    }

    async processIndexJob(graphIndexJobId: string) {
        const graphJob = await this.jobRepository.findOne({
            where: { id: graphIndexJobId },
            relations: [
                'knowledgebase',
                'knowledgebase.copilotModel',
                'knowledgebase.copilotModel.copilot',
                'knowledgebase.copilotModel.copilot.modelProvider'
            ]
        })
        if (!graphJob) {
            throw new NotFoundException(`Graph index job '${graphIndexJobId}' not found`)
        }

        if (!graphJob.documentId) {
            await this.markJobFailed(graphJob, 'Graph index job has no documentId')
            return
        }

        const knowledgebase = graphJob.knowledgebase
        if (!this.isEnabled(knowledgebase)) {
            await this.markJobSuccess(graphJob)
            await this.updateGraphStatusFromJobs(graphJob.knowledgebaseId)
            return
        }

        await this.jobRepository.update(graphJob.id, {
            status: KnowledgeGraphIndexJobStatus.RUNNING,
            startedAt: new Date(),
            error: null
        })

        try {
            await this.clearDocument(graphJob.knowledgebaseId, graphJob.documentId)
            const { items: chunks } = await this.chunkService.findAll({
                where: {
                    knowledgebaseId: graphJob.knowledgebaseId,
                    documentId: graphJob.documentId
                },
                relations: ['parent'],
                order: {
                    createdAt: 'ASC'
                }
            })
            const textChunks = chunks.filter((chunk) => this.isTextChunk(chunk) && !!chunk.pageContent)
            await this.jobRepository.update(graphJob.id, {
                totalChunks: textChunks.length,
                processedChunks: 0
            })
            if (!textChunks.length) {
                await this.markJobSuccess(graphJob)
                await this.updateGraphStatusFromJobs(graphJob.knowledgebaseId)
                return
            }

            const extraction = await this.extractDocumentGraph(knowledgebase, textChunks, knowledgebase.graphRag)
            const touchedEntityIds = await this.persistExtraction(graphJob, textChunks, extraction)
            await this.refreshEntityMentionCounts(graphJob.knowledgebaseId, touchedEntityIds)
            await this.syncEntityVectors(graphJob.knowledgebaseId)
            await this.markJobSuccess(graphJob)
        } catch (error) {
            await this.markJobFailed(graphJob, getErrorMessage(error))
        } finally {
            await this.updateGraphStatusFromJobs(graphJob.knowledgebaseId)
        }
    }

    async search(input: TKnowledgeGraphSearchInput): Promise<TKnowledgeGraphSearchResult> {
        const graphConfig = resolveGraphConfig({
            ...(input.graphRag ?? {}),
            ...(input.retrieval ?? {})
        })
        if (!this.isEnabled(input.knowledgebase) || input.knowledgebase.graphStatus === KnowledgeGraphStatus.DISABLED) {
            return { docs: [] }
        }

        try {
            const allowedDocumentIds = await this.resolveFilteredDocumentIds(
                input.knowledgebase.id,
                input.filter,
                input.filtering_conditions
            )
            if (allowedDocumentIds && !allowedDocumentIds.length) {
                return { docs: [] }
            }

            const entityScores = await this.searchEntities(input.knowledgebase, input.query, graphConfig.entityTopK)
            if (!entityScores.length) {
                return { docs: [] }
            }

            const expanded = await this.expandEntities(
                input.knowledgebase.id,
                entityScores.map((item) => item.entityId),
                graphConfig.neighborHops
            )
            const docs = await this.resolveGraphChunks({
                knowledgebaseId: input.knowledgebase.id,
                entityScores,
                entityIds: expanded.entityIds,
                relations: expanded.relations,
                allowedDocumentIds,
                topK: input.k
            })
            return { docs }
        } catch (error) {
            this.logger.warn(
                `GraphRAG search failed for knowledgebase '${input.knowledgebase.id}': ${getErrorMessage(error)}`
            )
            return {
                docs: [],
                failed: true,
                error: getErrorMessage(error)
            }
        }
    }

    private isTextChunk(chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>) {
        return !chunk.metadata?.mediaType || chunk.metadata.mediaType === 'text'
    }

    private async extractDocumentGraph(
        knowledgebase: IKnowledgebase,
        chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
        config?: GraphRagConfig | null
    ): Promise<TKnowledgeGraphExtraction> {
        const graphConfig = resolveGraphConfig(config)
        const copilot = await this.queryBus.execute<CopilotOneByRoleQuery, ICopilot>(
            new CopilotOneByRoleQuery(
                RequestContext.currentTenantId() ?? knowledgebase.tenantId,
                RequestContext.getOrganizationId() ?? knowledgebase.organizationId,
                AiProviderRole.Primary,
                ['copilotModel']
            )
        )
        if (!copilot?.copilotModel) {
            throw new Error('No available primary copilot found for GraphRAG extraction')
        }
        const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
            new CopilotModelGetChatModelQuery(copilot, copilot.copilotModel, {
                abortController: new AbortController(),
                usageCallback: () => {
                    //
                }
            })
        )
        const structuredModel = chatModel.withStructuredOutput<TKnowledgeGraphExtraction>(graphExtractionSchema, {
            method: 'functionCalling'
        })

        const merged: TKnowledgeGraphExtraction = {
            entities: [],
            relations: []
        }
        for (let index = 0; index < chunks.length; index += graphConfig.extractionBatchSize) {
            const batch = chunks.slice(index, index + graphConfig.extractionBatchSize)
            const input = this.formatChunksForExtraction(batch, graphConfig.extractionMaxCharacters)
            const output = await structuredModel.invoke([
                new SystemMessage(
                    [
                        'Extract a small knowledge graph from the provided chunks.',
                        'Use only explicit machine-readable fields in the output schema.',
                        'Every entity and relation must include a stable type. Do not infer missing types from names.',
                        'Use chunkId values exactly as provided for evidence.'
                    ].join('\n')
                ),
                new HumanMessage(`Knowledgebase: ${knowledgebase.name ?? knowledgebase.id}\n\n${input}`)
            ])
            merged.entities.push(...output.entities)
            merged.relations.push(...output.relations)
            await this.jobRepository.update(
                {
                    knowledgebaseId: knowledgebase.id,
                    documentId: chunks[0]?.documentId,
                    status: KnowledgeGraphIndexJobStatus.RUNNING
                },
                {
                    processedChunks: Math.min(chunks.length, index + batch.length)
                }
            )
        }
        return merged
    }

    private formatChunksForExtraction(chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[], maxCharacters: number) {
        let remaining = maxCharacters
        const parts: string[] = []
        for (const chunk of chunks) {
            if (remaining <= 0) {
                break
            }
            const chunkId = chunk.metadata?.chunkId ?? chunk.id
            const content = (chunk.pageContent ?? '').slice(0, remaining)
            remaining -= content.length
            parts.push(`<chunk id="${chunkId}">\n${content}\n</chunk>`)
        }
        return parts.join('\n\n')
    }

    private async persistExtraction(
        graphJob: KnowledgeGraphIndexJob,
        chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
        extraction: TKnowledgeGraphExtraction
    ) {
        const chunkById = new Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>>()
        for (const chunk of chunks) {
            const chunkId = chunk.metadata?.chunkId ?? chunk.id
            if (chunkId) {
                chunkById.set(chunkId, chunk)
            }
        }

        const entityMap = new Map<string, KnowledgeGraphEntity>()
        const touchedEntityIds = new Set<string>()
        for (const extracted of extraction.entities) {
            const entity = await this.upsertEntity(graphJob, extracted)
            entityMap.set(this.entityKey(extracted.name, extracted.type), entity)
            touchedEntityIds.add(entity.id)
            await this.createEntityMentions(graphJob, entity, extracted, chunkById)
        }

        for (const relation of extraction.relations) {
            const source = await this.resolveRelationEntity(
                graphJob,
                relation.sourceName,
                relation.sourceType,
                relation,
                entityMap
            )
            const target = await this.resolveRelationEntity(
                graphJob,
                relation.targetName,
                relation.targetType,
                relation,
                entityMap
            )
            touchedEntityIds.add(source.id)
            touchedEntityIds.add(target.id)
            const persistedRelation = await this.upsertRelation(graphJob, source, target, relation)
            await this.createRelationMentions(graphJob, persistedRelation, source, target, relation, chunkById)
        }

        return Array.from(touchedEntityIds)
    }

    private entityKey(name: string, type: string) {
        return `${normalizeKnowledgeGraphType(type)}:${normalizeKnowledgeGraphName(name)}`
    }

    private async upsertEntity(graphJob: KnowledgeGraphIndexJob, extracted: TKnowledgeGraphExtractionEntity) {
        const type = normalizeKnowledgeGraphType(extracted.type)
        const normalizedName = normalizeKnowledgeGraphName(extracted.name)
        let entity = await this.entityRepository.findOne({
            where: {
                tenantId: graphJob.tenantId ?? IsNull(),
                organizationId: graphJob.organizationId ?? IsNull(),
                knowledgebaseId: graphJob.knowledgebaseId,
                normalizedName,
                type
            }
        })
        if (!entity) {
            entity = this.entityRepository.create({
                tenantId: graphJob.tenantId,
                organizationId: graphJob.organizationId,
                knowledgebaseId: graphJob.knowledgebaseId,
                type,
                name: extracted.name.trim(),
                normalizedName,
                aliases: extracted.aliases ?? [],
                description: extracted.description ?? null,
                confidence: extracted.confidence ?? null,
                revision: graphJob.revision ?? 0
            })
        } else {
            entity.name = entity.name || extracted.name.trim()
            entity.aliases = uniq([...(entity.aliases ?? []), ...(extracted.aliases ?? [])])
            entity.description = extracted.description ?? entity.description
            entity.confidence = Math.max(entity.confidence ?? 0, extracted.confidence ?? 0)
            entity.revision = graphJob.revision ?? entity.revision
        }
        entity.summary = this.buildEntitySummary(entity)
        return this.entityRepository.save(entity)
    }

    private async resolveRelationEntity(
        graphJob: KnowledgeGraphIndexJob,
        name: string,
        type: string,
        relation: TKnowledgeGraphExtractionRelation,
        entityMap: Map<string, KnowledgeGraphEntity>
    ) {
        const key = this.entityKey(name, type)
        const existing = entityMap.get(key)
        if (existing) {
            return existing
        }
        const entity = await this.upsertEntity(graphJob, {
            name,
            type,
            description: relation.description ?? null,
            confidence: relation.confidence ?? null,
            evidence: relation.evidence ?? []
        })
        entityMap.set(key, entity)
        return entity
    }

    private async upsertRelation(
        graphJob: KnowledgeGraphIndexJob,
        source: KnowledgeGraphEntity,
        target: KnowledgeGraphEntity,
        extracted: TKnowledgeGraphExtractionRelation
    ) {
        const type = normalizeKnowledgeGraphType(extracted.type)
        let relation = await this.relationRepository.findOne({
            where: {
                knowledgebaseId: graphJob.knowledgebaseId,
                sourceEntityId: source.id,
                targetEntityId: target.id,
                type
            }
        })
        if (!relation) {
            relation = this.relationRepository.create({
                tenantId: graphJob.tenantId,
                organizationId: graphJob.organizationId,
                knowledgebaseId: graphJob.knowledgebaseId,
                sourceEntityId: source.id,
                targetEntityId: target.id,
                type,
                normalizedType: type,
                description: extracted.description ?? null,
                confidence: extracted.confidence ?? null,
                weight: extracted.confidence ?? null,
                revision: graphJob.revision ?? 0
            })
        } else {
            relation.description = extracted.description ?? relation.description
            relation.confidence = Math.max(relation.confidence ?? 0, extracted.confidence ?? 0)
            relation.weight = Math.max(relation.weight ?? 0, extracted.confidence ?? 0)
            relation.revision = graphJob.revision ?? relation.revision
        }
        return this.relationRepository.save(relation)
    }

    private async createEntityMentions(
        graphJob: KnowledgeGraphIndexJob,
        entity: KnowledgeGraphEntity,
        extracted: TKnowledgeGraphExtractionEntity,
        chunkById: Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>>
    ) {
        const evidence = extracted.evidence ?? []
        for (const item of evidence) {
            const chunk = chunkById.get(item.chunkId)
            if (!chunk) {
                continue
            }
            await this.mentionRepository.save(
                this.mentionRepository.create({
                    tenantId: graphJob.tenantId,
                    organizationId: graphJob.organizationId,
                    knowledgebaseId: graphJob.knowledgebaseId,
                    entityId: entity.id,
                    documentId: graphJob.documentId,
                    chunkId: item.chunkId,
                    quote: item.quote ?? null,
                    confidence: item.confidence ?? extracted.confidence ?? null,
                    revision: graphJob.revision ?? 0
                })
            )
        }
    }

    private async createRelationMentions(
        graphJob: KnowledgeGraphIndexJob,
        relation: KnowledgeGraphRelation,
        source: KnowledgeGraphEntity,
        target: KnowledgeGraphEntity,
        extracted: TKnowledgeGraphExtractionRelation,
        chunkById: Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>>
    ) {
        const evidence = extracted.evidence ?? []
        for (const item of evidence) {
            const chunk = chunkById.get(item.chunkId)
            if (!chunk) {
                continue
            }
            for (const entity of [source, target]) {
                await this.mentionRepository.save(
                    this.mentionRepository.create({
                        tenantId: graphJob.tenantId,
                        organizationId: graphJob.organizationId,
                        knowledgebaseId: graphJob.knowledgebaseId,
                        entityId: entity.id,
                        relationId: relation.id,
                        documentId: graphJob.documentId,
                        chunkId: item.chunkId,
                        quote: item.quote ?? null,
                        confidence: item.confidence ?? extracted.confidence ?? null,
                        revision: graphJob.revision ?? 0
                    })
                )
            }
        }
        relation.evidenceCount = await this.mentionRepository.count({ where: { relationId: relation.id } })
        await this.relationRepository.save(relation)
    }

    private buildEntitySummary(entity: Pick<KnowledgeGraphEntity, 'name' | 'type' | 'aliases' | 'description'>) {
        const aliases = entity.aliases?.length ? `Aliases: ${entity.aliases.join(', ')}.` : ''
        const description = entity.description ? `Description: ${entity.description}` : ''
        return [`${entity.name} (${entity.type}).`, aliases, description].filter(Boolean).join(' ')
    }

    private async refreshEntityMentionCounts(knowledgebaseId: string, entityIds: string[]) {
        for (const entityId of uniq(compact(entityIds))) {
            const mentionCount = await this.mentionRepository.count({ where: { knowledgebaseId, entityId } })
            await this.entityRepository.update(entityId, { mentionCount })
        }
    }

    private async pruneEntities(entityIds: string[]) {
        for (const entityId of uniq(compact(entityIds))) {
            const [mentionCount, outgoingCount, incomingCount] = await Promise.all([
                this.mentionRepository.count({ where: { entityId } }),
                this.relationRepository.count({ where: { sourceEntityId: entityId } }),
                this.relationRepository.count({ where: { targetEntityId: entityId } })
            ])
            if (!mentionCount && !outgoingCount && !incomingCount) {
                await this.entityRepository.delete({ id: entityId })
            }
        }
    }

    private async syncEntityVectors(knowledgebaseId: string) {
        const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
            relations: ['copilotModel', 'copilotModel.copilot', 'copilotModel.copilot.modelProvider']
        })
        if (!this.isEnabled(knowledgebase)) {
            return
        }

        const vectorStore = await this.knowledgebaseService.getGraphEntityVectorStore(knowledgebase, true)
        await vectorStore.clear()
        const entities = await this.entityRepository.find({
            where: { knowledgebaseId },
            order: { updatedAt: 'ASC' }
        })
        if (!entities.length) {
            return
        }
        const docs = entities.map((entity) => {
            const metadata: TDocChunkMetadata = {
                chunkId: entity.id,
                enabled: true,
                knowledgeId: knowledgebaseId,
                kind: 'knowledge_graph_entity',
                knowledgebaseId,
                graphEntityId: entity.id,
                entityName: entity.name,
                entityType: entity.type
            }
            return new Document<TDocChunkMetadata>({
                pageContent: entity.summary || this.buildEntitySummary(entity),
                metadata
            })
        })
        await vectorStore.addGraphDocuments(docs, { ids: entities.map((entity) => entity.id) })
    }

    private async markJobSuccess(graphJob: KnowledgeGraphIndexJob) {
        await this.jobRepository.update(graphJob.id, {
            status: KnowledgeGraphIndexJobStatus.SUCCESS,
            completedAt: new Date(),
            error: null
        })
    }

    private async markJobFailed(graphJob: KnowledgeGraphIndexJob, error: string) {
        await this.jobRepository.update(graphJob.id, {
            status: KnowledgeGraphIndexJobStatus.FAILED,
            completedAt: new Date(),
            error
        })
        await this.knowledgebaseRepository.update(graphJob.knowledgebaseId, {
            graphStatus: KnowledgeGraphStatus.FAILED,
            graphIndexError: error
        })
    }

    private async updateGraphStatusFromJobs(knowledgebaseId: string) {
        const [queued, running, failed] = await Promise.all([
            this.jobRepository.count({ where: { knowledgebaseId, status: KnowledgeGraphIndexJobStatus.QUEUED } }),
            this.jobRepository.count({ where: { knowledgebaseId, status: KnowledgeGraphIndexJobStatus.RUNNING } }),
            this.jobRepository.count({ where: { knowledgebaseId, status: KnowledgeGraphIndexJobStatus.FAILED } })
        ])
        if (queued || running) {
            await this.knowledgebaseRepository.update(knowledgebaseId, { graphStatus: KnowledgeGraphStatus.INDEXING })
            return
        }
        if (failed) {
            await this.knowledgebaseRepository.update(knowledgebaseId, { graphStatus: KnowledgeGraphStatus.FAILED })
            return
        }
        await this.knowledgebaseRepository.update(knowledgebaseId, {
            graphStatus: KnowledgeGraphStatus.READY,
            graphIndexError: null
        })
    }

    private async resolveFilteredDocumentIds(
        knowledgebaseId: string,
        filter?: KnowledgeDocumentMetadata,
        filteringConditions?: TWFCase
    ) {
        const hasSimpleFilter = filter && Object.keys(filter).length > 0
        if (!hasSimpleFilter && !filteringConditions) {
            return null
        }
        const where = filteringConditions
            ? {
                  knowledgebaseId,
                  metadata: buildMetadataCondition(filteringConditions)
              }
            : {
                  knowledgebaseId,
                  metadata: Raw((alias) => {
                      const conditions = Object.entries(filter ?? {}).map(([key, value]) => {
                          const rawValue = `${value}`.replace(/'/g, "''")
                          return `${alias} ->> '${key}' = '${rawValue}'`
                      })
                      return conditions.join(' AND ')
                  })
              }
        const documents = await this.documentService.findAll({
            where,
            select: {
                id: true
            }
        })
        return documents.items.map((document) => document.id)
    }

    private async searchEntities(knowledgebase: IKnowledgebase, query: string, entityTopK: number) {
        const vectorStore = await this.knowledgebaseService.getGraphEntityVectorStore(knowledgebase, true)
        const results = await vectorStore.similaritySearchWithScore(query, entityTopK, {
            kind: 'knowledge_graph_entity',
            knowledgebaseId: knowledgebase.id
        })
        return results
            .map(([doc, score]) => ({
                entityId: typeof doc.metadata?.graphEntityId === 'string' ? doc.metadata.graphEntityId : null,
                score: 1 - score
            }))
            .filter((item): item is { entityId: string; score: number } => !!item.entityId)
    }

    private async expandEntities(knowledgebaseId: string, seedEntityIds: string[], hops: number) {
        const entityIds = new Set(seedEntityIds)
        const relations = new Map<string, KnowledgeGraphRelation>()
        let frontier = [...seedEntityIds]
        for (let hop = 0; hop < hops && frontier.length; hop++) {
            const items = await this.relationRepository.find({
                where: [
                    { knowledgebaseId, sourceEntityId: In(frontier) },
                    { knowledgebaseId, targetEntityId: In(frontier) }
                ],
                relations: ['sourceEntity', 'targetEntity']
            })
            const next = new Set<string>()
            for (const relation of items) {
                relations.set(relation.id, relation)
                for (const id of [relation.sourceEntityId, relation.targetEntityId]) {
                    if (id && !entityIds.has(id)) {
                        entityIds.add(id)
                        next.add(id)
                    }
                }
            }
            frontier = [...next]
        }
        return {
            entityIds: [...entityIds],
            relations: [...relations.values()]
        }
    }

    private async resolveGraphChunks(options: {
        knowledgebaseId: string
        entityScores: Array<{ entityId: string; score: number }>
        entityIds: string[]
        relations: KnowledgeGraphRelation[]
        allowedDocumentIds: string[] | null
        topK?: number
    }) {
        const relationIds = options.relations.map((relation) => relation.id)
        const where: FindOptionsWhere<KnowledgeGraphMention>[] = [
            {
                knowledgebaseId: options.knowledgebaseId,
                entityId: In(options.entityIds)
            }
        ]
        if (relationIds.length) {
            where.push({
                knowledgebaseId: options.knowledgebaseId,
                relationId: In(relationIds)
            })
        }
        const mentions = await this.mentionRepository.find({
            where,
            order: {
                confidence: 'DESC',
                createdAt: 'DESC'
            }
        })
        const filteredMentions = options.allowedDocumentIds
            ? mentions.filter(
                  (mention) => mention.documentId && options.allowedDocumentIds.includes(mention.documentId)
              )
            : mentions
        const chunkIds = uniq(compact(filteredMentions.map((mention) => mention.chunkId)))
        if (!chunkIds.length) {
            return []
        }
        const { items: chunks } = await this.chunkService.findAll({
            where: {
                knowledgebaseId: options.knowledgebaseId,
                metadata: Raw((alias) => `${alias} ->> 'chunkId' = ANY(:ids)`, {
                    ids: chunkIds
                })
            },
            relations: ['document'],
            select: {
                document: {
                    id: true,
                    name: true,
                    sourceType: true,
                    type: true,
                    category: true,
                    fileUrl: true
                }
            }
        })
        const scoreByEntity = new Map(options.entityScores.map((item) => [item.entityId, item.score]))
        const mentionsByChunkId = new Map<string, KnowledgeGraphMention[]>()
        for (const mention of filteredMentions) {
            if (!mention.chunkId) {
                continue
            }
            mentionsByChunkId.set(mention.chunkId, [...(mentionsByChunkId.get(mention.chunkId) ?? []), mention])
        }
        const relationsById = new Map(options.relations.map((relation) => [relation.id, relation]))
        const docs = chunks.map((chunk) => {
            const chunkId = chunk.metadata?.chunkId ?? chunk.id
            const mentionsForChunk = mentionsByChunkId.get(chunkId) ?? []
            const graphScore = Math.max(
                ...mentionsForChunk.map((mention) => {
                    const entityScore = mention.entityId ? (scoreByEntity.get(mention.entityId) ?? 0.5) : 0.5
                    return entityScore * (mention.confidence ?? 1)
                }),
                0
            )
            const matchedEntities = uniq(compact(mentionsForChunk.map((mention) => mention.entityId)))
            const matchedRelations = uniq(compact(mentionsForChunk.map((mention) => mention.relationId))).map(
                (relationId) => {
                    const relation = relationsById.get(relationId)
                    return {
                        id: relationId,
                        type: relation?.type,
                        sourceEntityId: relation?.sourceEntityId,
                        targetEntityId: relation?.targetEntityId
                    }
                }
            )
            const metadata: TDocChunkMetadata = {
                ...(chunk.metadata ?? {}),
                chunkId,
                graphScore,
                score: graphScore,
                matchedEntities,
                relations: matchedRelations
            }
            chunk.metadata = metadata
            return chunk as DocumentInterface<DocumentMetadata>
        })
        return docs.sort((a, b) => (b.metadata.graphScore ?? 0) - (a.metadata.graphScore ?? 0)).slice(0, options.topK)
    }
}
