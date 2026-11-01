import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
    AiModelTypeEnum,
    IKnowledgebase,
    KnowledgebaseStatusEnum,
    mapTranslationLanguage,
    TCopilotModel,
    IModelAccessResolution
} from '@xpert-ai/contracts'

import { BadRequestException } from '@nestjs/common'

import { IRerank } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { assign } from 'lodash'
import { I18nService } from 'nestjs-i18n'

import { Repository } from 'typeorm'

import {
    CopilotModelGetChatModelQuery,
    CopilotModelGetEmbeddingsQuery,
    CopilotModelGetRerankQuery
} from '../../copilot-model/queries/index'
import { CopilotGetOneQuery } from '../../copilot/queries'
import { AiModelNotFoundException, CopilotModelNotFoundException, CopilotNotFoundException } from '../../core/errors'
import { RagCreateVStoreCommand } from '../../rag-vstore'

import { Knowledgebase } from '../persistence/knowledgebase.entity'

import {
    createEmbeddingCollectionName,
    createEmbeddingFingerprint,
    TResolvedEmbeddingModelTarget
} from './embedding-state'

import { KnowledgeDocumentStore, TEmbeddingVectorMetadata } from './vector-store'

import { RequestContext } from '@xpert-ai/plugin-sdk'

import type { KnowledgebaseService } from '../management/knowledgebase.service'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { TEmbeddingCopilotModel, TKnowledgebaseModelContext } from './knowledgebase-model-policy'

interface KnowledgebaseEmbeddingOperationsContext {
    commandBus: CommandBus
    findOne: KnowledgebaseService['findOne']
    i18nService: I18nService
    queryBus: QueryBus
    repository: Repository<Knowledgebase>
}

export class KnowledgebaseEmbeddingOperations {
    constructor(private readonly context: KnowledgebaseEmbeddingOperationsContext) {}

    async getVisionModel(knowledgebaseId: string, visionModel: TCopilotModel) {
        if (!visionModel) {
            const knowledgebase = await this.context.findOne(knowledgebaseId, {
                relations: ['visionModel', 'visionModel.copilot']
            })
            visionModel = knowledgebase.visionModel
        }
        // Workflow nodes usually persist only copilotId, not the eager-loaded copilot relation.
        if (!visionModel?.copilot && !visionModel?.copilotId) {
            throw new BadRequestException(t('server-ai:Error.KBReqVisionModel'))
        }
        const chatModel = await this.context.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
            new CopilotModelGetChatModelQuery(visionModel?.copilot ?? null, visionModel, {
                usageCallback: (token) => {
                    // execution.tokens += (token ?? 0)
                }
            })
        )

        return chatModel
    }

    getActiveVectorStoreRelations(requiredEmbeddings: boolean, rerankEnabled = true) {
        return requiredEmbeddings
            ? [
                  ...(rerankEnabled ? ['rerankModel', 'rerankModel.copilot', 'rerankModel.copilot.modelProvider'] : []),
                  'copilotModel',
                  'copilotModel.copilot',
                  'copilotModel.copilot.modelProvider',
                  'documents'
              ]
            : ['copilotModel', 'copilotModel.copilot', 'copilotModel.copilot.modelProvider']
    }

    getPendingVectorStoreRelations() {
        return ['pendingCopilotModel', 'pendingCopilotModel.copilot', 'pendingCopilotModel.copilot.modelProvider']
    }

    async findKnowledgebaseForActiveVectorStore(
        knowledgebaseId: IKnowledgebase | string,
        requiredEmbeddings: boolean,
        rerankEnabled = true
    ) {
        let knowledgebase: IKnowledgebase
        if (typeof knowledgebaseId === 'string') {
            knowledgebase = await this.context.findOne(knowledgebaseId, {
                relations: this.getActiveVectorStoreRelations(requiredEmbeddings, rerankEnabled)
            })
        } else {
            knowledgebase = knowledgebaseId
        }

        return knowledgebase
    }

    async findKnowledgebaseForPendingVectorStore(knowledgebaseId: IKnowledgebase | string) {
        if (typeof knowledgebaseId === 'string') {
            return this.context.findOne(knowledgebaseId, {
                relations: this.getPendingVectorStoreRelations()
            })
        }

        return knowledgebaseId
    }

    async ensureCopilotModel(model: TEmbeddingCopilotModel | null | undefined) {
        if (!model) {
            return null
        }

        if (model.copilot?.modelProvider || !model.copilotId) {
            return model
        }

        const copilot = await this.context.queryBus.execute(
            new CopilotGetOneQuery(RequestContext.currentTenantId(), model.copilotId, ['modelProvider'])
        )
        return {
            ...model,
            copilot
        }
    }

    getEmbeddingModelName(copilotModel: TEmbeddingCopilotModel | null | undefined) {
        return copilotModel?.model || copilotModel?.copilot?.copilotModel?.model || null
    }

    getEmbeddingProviderName(copilotModel: TEmbeddingCopilotModel | null | undefined) {
        return (
            copilotModel?.copilot?.modelProvider?.providerName ??
            copilotModel?.copilot?.modelProvider?.providerType ??
            null
        )
    }

    resolveConfiguredEmbeddingDimensions(copilotModel: TEmbeddingCopilotModel | null | undefined) {
        const dimensions = copilotModel?.options?.dimensions
        if (typeof dimensions === 'number') {
            return dimensions
        }

        const dimension = copilotModel?.options?.dimension
        return typeof dimension === 'number' ? dimension : null
    }

    async resolveEmbeddingDimensions(
        copilotModel: TEmbeddingCopilotModel,
        modelContext?: TKnowledgebaseModelContext
    ) {
        const configuredDimensions = this.resolveConfiguredEmbeddingDimensions(copilotModel)
        if (configuredDimensions) {
            return configuredDimensions
        }

        const copilot = copilotModel.copilot
        if (!copilot) {
            throw new CopilotNotFoundException(
                `Copilot not set for embedding model '${this.getEmbeddingModelName(copilotModel)}'`
            )
        }

        const embeddings = await this.context.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
            new CopilotModelGetEmbeddingsQuery(copilot, copilotModel as TCopilotModel, {
                ...modelContext,
                tokenCallback: () => {
                    //
                }
            })
        )
        const probe = await embeddings.embedQuery('xpert embedding dimension probe')
        return probe.length
    }

    async resolveEmbeddingModelTarget(
        knowledgebaseId: string,
        copilotModel: TEmbeddingCopilotModel | null,
        copilotModelId?: string | null,
        modelContext?: TKnowledgebaseModelContext
    ): Promise<TResolvedEmbeddingModelTarget> {
        const resolvedModel = await this.ensureCopilotModel(copilotModel)
        if (!resolvedModel) {
            throw new BadRequestException('Embedding model is required')
        }

        const dimensions = await this.resolveEmbeddingDimensions(resolvedModel, modelContext)
        const fingerprint = createEmbeddingFingerprint({
            provider: this.getEmbeddingProviderName(resolvedModel),
            model: this.getEmbeddingModelName(resolvedModel),
            dimensions,
            options: resolvedModel.options ?? null,
            providerConfig: {
                providerId: resolvedModel.copilot?.modelProvider?.id ?? null,
                providerName: resolvedModel.copilot?.modelProvider?.providerName ?? null,
                providerType: resolvedModel.copilot?.modelProvider?.providerType ?? null,
                options: resolvedModel.copilot?.modelProvider?.options ?? null
            }
        })

        return {
            copilotModel: resolvedModel,
            copilotModelId: copilotModelId ?? resolvedModel.id ?? null,
            collectionName: createEmbeddingCollectionName(knowledgebaseId, fingerprint),
            fingerprint,
            dimensions
        }
    }

    async resolveEmbeddingModelTargetForComparison(
        knowledgebaseId: string,
        copilotModel: TEmbeddingCopilotModel | null,
        copilotModelId?: string | null
    ) {
        return this.resolveEmbeddingModelTarget(knowledgebaseId, copilotModel, copilotModelId)
    }

    async ensureLegacyActiveEmbeddingState(
        knowledgebase: IKnowledgebase,
        requiredEmbeddings: boolean,
        modelContext?: TKnowledgebaseModelContext
    ) {
        if (!requiredEmbeddings || knowledgebase.embeddingCollectionName || !knowledgebase.copilotModel) {
            return
        }

        const target = await this.resolveEmbeddingModelTarget(
            knowledgebase.id,
            knowledgebase.copilotModel,
            knowledgebase.copilotModelId,
            modelContext
        )
        const patch = {
            embeddingCollectionName: knowledgebase.id,
            embeddingModelFingerprint: target.fingerprint,
            embeddingDimensions: target.dimensions,
            embeddingRevision: knowledgebase.embeddingRevision ?? 1,
            status: (knowledgebase.status as KnowledgebaseStatusEnum) ?? KnowledgebaseStatusEnum.READY
        }
        await this.context.repository.update(knowledgebase.id, patch)
        assign(knowledgebase, patch)
    }

    async createVectorStoreForModel(options: {
        knowledgebase: IKnowledgebase
        copilotModel: TEmbeddingCopilotModel | null | undefined
        collectionName: string
        requiredEmbeddings: boolean
        rerankEnabled: boolean
        embeddingMetadata: TEmbeddingVectorMetadata
        modelContext?: TKnowledgebaseModelContext
    }) {
        const { collectionName, requiredEmbeddings, rerankEnabled, embeddingMetadata } = options
        let { knowledgebase } = options
        if (knowledgebase.vectorStore === undefined) {
            const persisted = await this.context.findOne(knowledgebase.id)
            knowledgebase = { ...knowledgebase, vectorStore: persisted.vectorStore ?? null }
        }
        const copilotModel = await this.ensureCopilotModel(options.copilotModel)
        if (requiredEmbeddings && !copilotModel) {
            throw new CopilotModelNotFoundException(
                await this.context.i18nService.t('rag.Error.KnowledgebaseNoModel', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
                    args: {
                        knowledgebase: knowledgebase.name
                    }
                })
            )
        }
        const copilot = copilotModel?.copilot
        if (requiredEmbeddings && !copilot) {
            throw new CopilotNotFoundException(`Copilot not set for knowledgebase '${knowledgebase.name}'`)
        }

        let embeddings = null
        let embeddingModelAccess: IModelAccessResolution | null = null
        if (copilotModel && copilot?.modelProvider) {
            embeddings = await this.context.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
                new CopilotModelGetEmbeddingsQuery(copilot, copilotModel as TCopilotModel, {
                    ...options.modelContext,
                    tokenCallback: (token) => {
                        // execution.tokens += (token ?? 0)
                    },
                    modelAccessCallback: (modelAccess) => {
                        embeddingModelAccess = modelAccess
                    }
                })
            )
        }

        if (requiredEmbeddings && !embeddings) {
            throw new AiModelNotFoundException(
                `Embeddings model '${this.getEmbeddingModelName(copilotModel)}' not found for knowledgebase '${knowledgebase.name}'`
            )
        }

        const rerankModel =
            rerankEnabled && knowledgebase.rerankModel
                ? await this.createRerankModel(knowledgebase, options.modelContext)
                : null

        const store = await this.context.commandBus.execute(
            new RagCreateVStoreCommand(embeddings, {
                collectionName,
                vectorStore: knowledgebase.vectorStore
            })
        )
        const vStore = new KnowledgeDocumentStore(
            {
                ...knowledgebase,
                copilotModel: copilotModel as TCopilotModel,
                copilotModelId: copilotModel?.id ?? knowledgebase.copilotModelId
            },
            store,
            rerankModel,
            embeddingMetadata,
            embeddingModelAccess
        )

        // const vectorStore = new KnowledgeDocumentVectorStore(knowledgebase, this.pgPool, embeddings, rerankModel)

        // // Create table for vector store if not exist
        // await vectorStore.ensureTableInDatabase()

        return vStore
    }

    async createRerankModel(
        knowledgebase: Pick<IKnowledgebase, 'name'> & { rerankModel?: TCopilotModel },
        modelContext?: TKnowledgebaseModelContext
    ) {
        const model = knowledgebase.rerankModel
        const rerankModel = model
            ? await this.context.queryBus.execute<CopilotModelGetRerankQuery, IRerank>(
                  new CopilotModelGetRerankQuery(model.copilot, model, {
                      ...modelContext,
                      tokenCallback: (token) => {
                          // execution.tokens += (token ?? 0)
                      }
                  })
              )
            : null
        if (!rerankModel) {
            const defaultValue = `Rerank model is not available for knowledgebase '${knowledgebase.name}'.`
            throw new AiModelNotFoundException(
                t('server-ai:Error.KnowledgeRerankModelUnavailable', {
                    knowledgebase: knowledgebase.name,
                    defaultValue
                }) || defaultValue
            )
        }
        return rerankModel
    }

    async getRerankModel(
        knowledgebaseId: string,
        modelContext?: TKnowledgebaseModelContext,
        requestedModel?: TCopilotModel
    ) {
        const knowledgebase = await this.context.findOne(knowledgebaseId, {
            relations: ['rerankModel', 'rerankModel.copilot', 'rerankModel.copilot.modelProvider']
        })
        if (requestedModel !== undefined) {
            // Resolve the provider server-side; never trust client-supplied copilot credentials or relations.
            if (
                !requestedModel.copilotId ||
                !requestedModel.model ||
                requestedModel.modelType !== AiModelTypeEnum.RERANK
            ) {
                throw new BadRequestException('A rerank model and its copilot are required.')
            }
            const model = await this.ensureCopilotModel({
                copilotId: requestedModel.copilotId,
                model: requestedModel.model,
                modelType: AiModelTypeEnum.RERANK,
                options: requestedModel.options
            })
            return this.createRerankModel({ name: knowledgebase.name, rerankModel: model }, modelContext)
        }
        return this.createRerankModel(knowledgebase, modelContext)
    }

    async getActiveVectorStore(
        knowledgebaseId: IKnowledgebase | string,
        requiredEmbeddings = false,
        modelContext?: TKnowledgebaseModelContext,
        options?: { rerankEnabled?: boolean }
    ) {
        const rerankEnabled = options?.rerankEnabled ?? true
        const knowledgebase = await this.findKnowledgebaseForActiveVectorStore(
            knowledgebaseId,
            requiredEmbeddings,
            rerankEnabled
        )
        await this.ensureLegacyActiveEmbeddingState(knowledgebase, requiredEmbeddings, modelContext)
        const copilotModel = knowledgebase.copilotModel
        const collectionName = knowledgebase.embeddingCollectionName ?? knowledgebase.id
        return this.createVectorStoreForModel({
            knowledgebase,
            copilotModel,
            collectionName,
            requiredEmbeddings,
            rerankEnabled,
            modelContext,
            embeddingMetadata: {
                provider: this.getEmbeddingProviderName(copilotModel),
                model: this.getEmbeddingModelName(copilotModel),
                embeddingModelFingerprint: knowledgebase.embeddingModelFingerprint ?? null,
                embeddingDimensions: knowledgebase.embeddingDimensions ?? null,
                embeddingRevision: knowledgebase.embeddingRevision ?? null,
                vectorIdCollectionName: collectionName
            }
        })
    }

    async getGraphEntityVectorStore(
        knowledgebaseId: IKnowledgebase | string,
        requiredEmbeddings = false,
        modelContext?: TKnowledgebaseModelContext
    ) {
        const knowledgebase = await this.findKnowledgebaseForActiveVectorStore(knowledgebaseId, requiredEmbeddings)
        await this.ensureLegacyActiveEmbeddingState(knowledgebase, requiredEmbeddings, modelContext)
        const copilotModel = knowledgebase.copilotModel
        const activeCollectionName = knowledgebase.embeddingCollectionName ?? knowledgebase.id
        const collectionName = `${activeCollectionName}:graph-entities`
        return this.createVectorStoreForModel({
            knowledgebase,
            copilotModel,
            collectionName,
            requiredEmbeddings,
            rerankEnabled: false,
            modelContext,
            embeddingMetadata: {
                provider: this.getEmbeddingProviderName(copilotModel),
                model: this.getEmbeddingModelName(copilotModel),
                embeddingModelFingerprint: knowledgebase.embeddingModelFingerprint ?? null,
                embeddingDimensions: knowledgebase.embeddingDimensions ?? null,
                embeddingRevision: knowledgebase.embeddingRevision ?? null,
                vectorIdCollectionName: collectionName
            }
        })
    }

    async getPendingVectorStoreForRebuild(knowledgebaseId: IKnowledgebase | string) {
        const knowledgebase = await this.findKnowledgebaseForPendingVectorStore(knowledgebaseId)
        if (!knowledgebase.pendingCopilotModel || !knowledgebase.pendingEmbeddingCollectionName) {
            throw new BadRequestException('Pending embedding model is required for rebuild')
        }

        return this.createVectorStoreForModel({
            knowledgebase,
            copilotModel: knowledgebase.pendingCopilotModel,
            collectionName: knowledgebase.pendingEmbeddingCollectionName,
            requiredEmbeddings: true,
            rerankEnabled: false,
            embeddingMetadata: {
                provider: this.getEmbeddingProviderName(knowledgebase.pendingCopilotModel),
                model: this.getEmbeddingModelName(knowledgebase.pendingCopilotModel),
                embeddingModelFingerprint: knowledgebase.pendingEmbeddingModelFingerprint ?? null,
                embeddingDimensions: knowledgebase.pendingEmbeddingDimensions ?? null,
                embeddingRevision: knowledgebase.pendingEmbeddingRevision ?? null,
                vectorIdCollectionName: knowledgebase.pendingEmbeddingCollectionName
            }
        })
    }
}
