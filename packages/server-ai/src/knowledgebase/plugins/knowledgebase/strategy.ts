import { RunnableLambda } from '@langchain/core/runnables'
import {
    channelName,
    IEnvironment,
    IKnowledgebase,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    IWFNKnowledgeBase,
    IWorkflowNode,
    IXpertAgentExecution,
    KBDocumentStatusEnum,
    KnowledgeDocumentLastIncrementalSync,
    KnowledgebaseChannel,
    KnowledgeDocumentMetadata,
    KnowledgeTask,
    TAgentRunnableConfigurable,
    TWorkflowNodeMeta,
    TXpertGraph,
    TXpertParameter,
    TXpertTeamNode,
    WorkflowNodeTypeEnum,
    XpertParameterTypeEnum
} from '@xpert-ai/contracts'
import { getErrorMessage, runWithConcurrencyLimit } from '@xpert-ai/server-common'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { countTokensSafe, IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { In } from 'typeorm'
import { CopilotTokenRecordCommand } from '../../../copilot-user'
import { KnowledgeGraphEnqueueCommand } from '../../../graphrag/commands'
import { IncrementalChunkSyncResult, KnowledgeDocumentService } from '../../../knowledge-document'
import {
    computeKnowledgeDocumentProcessingHash,
    resolveKnowledgeDocumentSourceHash
} from '../../../knowledge-document/document-hash'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeDocumentStore } from '../../vector-store'
import { KnowledgebaseTaskService } from '../../task'
import { ERROR_CHANNEL_NAME } from '../types'
import { TDocChunkMetadata } from '../../../knowledge-document/types'

const InfoChannelName = 'info'
const TaskChannelName = 'task'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.KNOWLEDGE_BASE)
export class WorkflowKnowledgeBaseNodeStrategy implements IWorkflowNodeStrategy {
    private readonly logger = new Logger(WorkflowKnowledgeBaseNodeStrategy.name)

    readonly meta: TWorkflowNodeMeta = {
        name: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
        label: {
            en_US: 'Knowledge Base',
            zh_Hans: '知识库'
        },
        icon: null,
        configSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }

    @Inject(KnowledgebaseService)
    private readonly knowledgebaseService: KnowledgebaseService

    @Inject(KnowledgeDocumentService)
    private readonly documentService: KnowledgeDocumentService

    @Inject(KnowledgebaseTaskService)
    private readonly taskService: KnowledgebaseTaskService

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    create(payload: {
        graph: TXpertGraph
        node: TXpertTeamNode & { type: 'workflow' }
        xpertId: string
        environment: IEnvironment
        isDraft: boolean
    }) {
        const { graph, node, xpertId, environment, isDraft } = payload
        const entity = node.entity as IWFNKnowledgeBase

        return {
            graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
                const configurable: TAgentRunnableConfigurable = config.configurable
                const { thread_id, checkpoint_ns, checkpoint_id, subscriber, userId, executionId } = configurable
                const stateEnv = stateWithEnvironment(state, environment)
                const knowledgebaseState = state[KnowledgebaseChannel]
                const knowledgebaseId = knowledgebaseState?.['knowledgebaseId'] as string
                const knowledgeTaskId = knowledgebaseState?.[KnowledgeTask] as string
                const stage = knowledgebaseState?.['stage']
                const isTest = stage === 'preview' || isDraft

                const values = entity.inputs.map((input) => get(stateEnv, input)) as Partial<IKnowledgeDocument[]>[]
                const inputDocuments = values.filter((docs) => !!docs).flat()

                const execution: IXpertAgentExecution = {
                    category: 'workflow',
                    type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
                    inputs: inputDocuments,
                    parentId: executionId,
                    threadId: thread_id,
                    checkpointNs: checkpoint_ns,
                    checkpointId: checkpoint_id,
                    agentKey: node.key,
                    title: entity.title
                }
                return await wrapAgentExecution(
                    async () => {
                        let statisticsInformation = ''
                        if (isTest) {
                            await this.taskService.update(knowledgeTaskId, { status: 'success' })
                            statisticsInformation += `- This is a test run, no documents were processed. \n`
                            return {
                                state: {
                                    [channelName(node.key)]: {
                                        [InfoChannelName]: statisticsInformation.trim(),
                                        [TaskChannelName]: {
                                            status: 'success'
                                        }
                                    }
                                },
                                output: statisticsInformation.trim()
                            }
                        }

                        const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
                            relations: ['copilotModel', 'copilotModel.copilot']
                        })

                        let vectorStore: KnowledgeDocumentStore
                        try {
                            vectorStore = await this.knowledgebaseService.getActiveVectorStore(knowledgebase, true)
                        } catch (err) {
                            statisticsInformation += `- Error initializing vector store: ${getErrorMessage(err)} \n`
                            throw new Error(`Error initializing vector store: ${getErrorMessage(err)}`)
                        }

                        const { items: documents } = await this.documentService.findAll({
                            where: {
                                id: In(inputDocuments.map(({ id }) => id) as string[]),
                                knowledgebaseId
                            }
                            // relations: ['chunks']
                        })

                        const tasks = documents.map((document, index) => async () => {
                            statisticsInformation += `- Document ${index + 1} - ${document.name}: \n`
                            try {
                                // Save pages into db, And associated with the chunk's metadata.
                                let chunks = document.draft?.chunks as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
                                let totalTokenUsed = 0
                                let embeddingTokenUsed = 0
                                let totalChunks = chunks?.length ?? 0
                                let syncResult: IncrementalChunkSyncResult | null = null
                                const processingHash = computeKnowledgeDocumentProcessingHash(document)
                                const sourceHash = resolveKnowledgeDocumentSourceHash(document)
                                if (
                                    document.status === KBDocumentStatusEnum.FINISH &&
                                    document.processingHash === processingHash &&
                                    document.contentHash
                                ) {
                                    await this.updateDocumentProcessingMetadata(
                                        document.id,
                                        {
                                            status: KBDocumentStatusEnum.FINISH,
                                            processMsg: '',
                                            progress: 100,
                                            processingHash,
                                            sourceHash
                                        },
                                        {
                                            lastIncrementalSync: this.createSkippedIncrementalSyncMetadata(document)
                                        }
                                    )
                                    statisticsInformation += ` - Skipped unchanged source. \n`
                                    return
                                }
                                if (chunks) {
                                    this.logger.debug(`Embeddings document '${document.name}' size: ${chunks.length}`)
                                    syncResult = await this.documentService.syncChunksIncrementally(
                                        { ...document, chunks },
                                        vectorStore
                                    )
                                    document.chunks = syncResult.chunks
                                    chunks = syncResult.embeddingChunks
                                    totalChunks = syncResult.chunks.length
                                    totalTokenUsed = await this.countEmbeddingTokens(document)
                                    await this.updateDocumentProcessingMetadata(
                                        document.id,
                                        {
                                            status: KBDocumentStatusEnum.EMBEDDING,
                                            progress: 0,
                                            draft: null,
                                            contentHash: syncResult.contentHash,
                                            processingHash,
                                            sourceHash,
                                            chunkNum: syncResult.chunks.length,
                                            tokenNum: totalTokenUsed
                                        },
                                        { tokens: totalTokenUsed }
                                    )

                                    const batchSize = knowledgebase.parserConfig?.embeddingBatchSize || 10
                                    let count = 0
                                    while (batchSize * count < chunks.length) {
                                        const batch = chunks.slice(batchSize * count, batchSize * (count + 1))
                                        // Count and Record token usage for embedding
                                        // Use searchContent when present, otherwise fall back to full pageContent
                                        let tokenUsed = 0
                                        batch.forEach((chunk) => {
                                            const contentForEmbedding =
                                                chunk.metadata?.searchContent ?? chunk.pageContent
                                            chunk.metadata.tokens = countTokensSafe(contentForEmbedding)
                                            tokenUsed += chunk.metadata.tokens
                                        })
                                        embeddingTokenUsed += tokenUsed
                                        await this.documentService.save(
                                            batch.map((chunk) => ({
                                                id: chunk.id,
                                                metadata: chunk.metadata
                                            }))
                                        )
                                        await this.commandBus.execute(
                                            new CopilotTokenRecordCommand({
                                                tenantId: knowledgebase.tenantId,
                                                organizationId: knowledgebase.organizationId,
                                                userId,
                                                xpertId,
                                                copilotId: knowledgebase.copilotModel.copilot.id,
                                                tokenUsed,
                                                model: vectorStore.embeddingModel
                                            })
                                        )
                                        await vectorStore.addKnowledgeDocument(document, batch)
                                        count++
                                        const progress =
                                            batchSize * count >= chunks.length
                                                ? 100
                                                : (((batchSize * count) / chunks.length) * 100).toFixed(1)
                                        this.logger.debug(
                                            `Embeddings document '${document.name}' progress: ${progress}%`
                                        )
                                        if (await this.checkIfJobCancelled(document.id)) {
                                            throw KBDocumentStatusEnum.CANCEL
                                        }
                                        await this.updateDocumentProcessingMetadata(
                                            document.id,
                                            {
                                                status: KBDocumentStatusEnum.EMBEDDING,
                                                progress: Number(progress)
                                            },
                                            { tokens: totalTokenUsed }
                                        )
                                    }
                                    if (syncResult.contentChanged) {
                                        await this.enqueueGraphIndex(knowledgebase, document.id, userId)
                                    }
                                }
                                await this.updateDocumentProcessingMetadata(
                                    document.id,
                                    {
                                        status: KBDocumentStatusEnum.FINISH,
                                        processMsg: '',
                                        progress: 100,
                                        processingHash,
                                        sourceHash
                                    },
                                    {
                                        tokens: totalTokenUsed,
                                        lastIncrementalSync: syncResult
                                            ? this.createIncrementalSyncMetadata(
                                                  document,
                                                  syncResult,
                                                  embeddingTokenUsed
                                              )
                                            : this.createSkippedIncrementalSyncMetadata(document)
                                    }
                                )
                                statisticsInformation += ` - Embedded ${chunks?.length || 0}/${totalChunks} chunks. \n`
                            } catch (err) {
                                if (err === KBDocumentStatusEnum.CANCEL) {
                                    statisticsInformation += ` - Cancelled by user. \n`
                                    return
                                }
                                this.documentService.update(document.id, {
                                    status: KBDocumentStatusEnum.ERROR,
                                    processMsg: getErrorMessage(err)
                                })
                                statisticsInformation += ` - Error: ${getErrorMessage(err)} \n`
                            }
                        })

                        const results = await runWithConcurrencyLimit(tasks, 3)

                        // Update task status
                        await this.taskService.update(knowledgeTaskId, {
                            status: 'success'
                        })

                        return {
                            state: {
                                [channelName(node.key)]: {
                                    [InfoChannelName]: statisticsInformation.trim(),
                                    [TaskChannelName]: {
                                        status: 'success'
                                    },
                                    [ERROR_CHANNEL_NAME]: null
                                }
                            }
                        }
                    },
                    {
                        commandBus: this.commandBus,
                        queryBus: this.queryBus,
                        subscriber: subscriber,
                        execution,
                        catchError: async (error) => {
                            if (!isTest) {
                                for await (const { id } of inputDocuments) {
                                    await this.documentService.update(id, {
                                        status: KBDocumentStatusEnum.ERROR,
                                        processMsg: getErrorMessage(error)
                                    })
                                }
                                await this.taskService.update(knowledgeTaskId, {
                                    status: 'failed',
                                    error: getErrorMessage(error)
                                })
                            }
                        }
                    }
                )()
            }),
            ends: []
        }
    }

    outputVariables(entity: IWorkflowNode): TXpertParameter[] {
        return [
            {
                type: XpertParameterTypeEnum.STRING,
                name: ERROR_CHANNEL_NAME,
                title: 'Error',
                description: {
                    en_US: 'Error info',
                    zh_Hans: '错误信息'
                }
            },
            {
                type: XpertParameterTypeEnum.STRING,
                name: InfoChannelName,
                title: 'Information',
                description: {
                    en_US: 'Statistics Information',
                    zh_Hans: '统计信息'
                }
            },
            {
                type: XpertParameterTypeEnum.OBJECT,
                name: TaskChannelName,
                title: 'Task',
                description: {
                    en_US: 'Task Object',
                    zh_Hans: '任务对象'
                },
                item: [
                    {
                        type: XpertParameterTypeEnum.STRING,
                        name: 'status',
                        title: 'Status',
                        description: {
                            en_US: 'Task Status',
                            zh_Hans: '任务状态'
                        },
                        options: ['pending', 'processing', 'success', 'error', 'cancel']
                    }
                ]
            }
        ]
    }

    private async countEmbeddingTokens(document: IKnowledgeDocument) {
        const chunks = await this.documentService.findAllEmbeddingNodes(document)
        return chunks.reduce((tokens, chunk) => {
            const contentForEmbedding = chunk.metadata?.searchContent ?? chunk.pageContent
            return tokens + countTokensSafe(contentForEmbedding)
        }, 0)
    }

    private createSkippedIncrementalSyncMetadata(
        document: Pick<IKnowledgeDocument<KnowledgeDocumentMetadata>, 'chunks' | 'chunkNum'>
    ): KnowledgeDocumentLastIncrementalSync {
        const total = document.chunks?.length ?? document.chunkNum ?? 0
        return {
            mode: 'skipped',
            total,
            skipped: total,
            added: 0,
            updated: 0,
            deleted: 0,
            embeddingTokens: 0,
            processedAt: new Date().toISOString()
        }
    }

    private createIncrementalSyncMetadata(
        document: Pick<IKnowledgeDocument<KnowledgeDocumentMetadata>, 'contentHash'>,
        syncResult: IncrementalChunkSyncResult,
        embeddingTokens: number
    ): KnowledgeDocumentLastIncrementalSync {
        const mode = !syncResult.contentChanged ? 'skipped' : document.contentHash ? 'incremental' : 'full'
        return {
            mode,
            total: syncResult.statistics.total,
            skipped: syncResult.statistics.skipped,
            added: syncResult.statistics.added,
            updated: syncResult.statistics.updated,
            deleted: syncResult.statistics.deleted,
            embeddingTokens,
            processedAt: new Date().toISOString()
        }
    }

    private async updateDocumentProcessingMetadata(
        documentId: string,
        updates: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>,
        metadataPatch?: Partial<KnowledgeDocumentMetadata>
    ) {
        if (!metadataPatch) {
            return await this.documentService.update(documentId, updates)
        }

        const current = await this.documentService.findOne(documentId, { select: { id: true, metadata: true } })
        return await this.documentService.update(documentId, {
            ...updates,
            metadata: {
                ...(current.metadata ?? {}),
                ...metadataPatch
            }
        })
    }

    private async enqueueGraphIndex(knowledgebase: IKnowledgebase, documentId: string, userId?: string) {
        try {
            await this.commandBus.execute(
                new KnowledgeGraphEnqueueCommand({
                    userId,
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    documentIds: [documentId],
                    reason: 'document'
                })
            )
        } catch (error) {
            this.logger.warn(`Failed to enqueue GraphRAG index for document '${documentId}': ${getErrorMessage(error)}`)
        }
    }

    async checkIfJobCancelled(docId: string): Promise<boolean> {
        // Check database/cache for cancellation flag
        const doc = await this.documentService.findOne(docId, { select: ['status'] })
        if (doc) {
            return doc?.status === KBDocumentStatusEnum.CANCEL
        }
        return true
    }
}
