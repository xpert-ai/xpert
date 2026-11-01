import { rethrowParserError } from '../../knowledge-document/parser-error'

import { dispatchKnowledgePipeline } from './pipeline-task'
import { prepareKnowledgePipelineDocuments } from './prepare-pipeline-documents'

import {
    IKnowledgebaseTask,
    IKnowledgeDocument,
    IWFNProcessor,
    KBDocumentStatusEnum,
    KnowledgebaseStatusEnum,
    classificateDocumentCategory,
    KnowledgeDocumentMetadata,
    knowledgeDocumentFileType,
    KnowledgeDocumentProcessingMode,
    KDocumentSourceType
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { PaginationParams } from '@xpert-ai/server-core'

import { BadRequestException, InternalServerErrorException } from '@nestjs/common'

import { DocumentTransformerRegistry } from '@xpert-ai/plugin-sdk'

import path from 'node:path'
import { FindOptionsWhere, In } from 'typeorm'

import { Knowledgebase } from '../persistence/knowledgebase.entity'

import { KnowledgebaseTask, KnowledgebaseTaskService } from './index'

import { KnowledgeWorkAreaResolver } from '../../shared/volume/work-area'
import { VolumeSubtreeClient } from '../../shared/volume/volume-subtree'
import { KnowledgeDocumentService } from '../../knowledge-document/document.service'

import { PluginPermissionsCommand } from '../commands'

import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries'

import { RequestContext } from '@xpert-ai/plugin-sdk'

import type { KnowledgebaseService } from '../management/knowledgebase.service'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    knowledgebaseTaskAccessDenied,
    assertSafeKnowledgebaseTaskRelations,
    resolveKnowledgebaseTaskFilePath
} from './knowledgebase-task-policy'

interface KnowledgebaseTaskOperationsContext {
    assertKnowledgebaseTaskReadAccess: KnowledgebaseService['assertKnowledgebaseTaskReadAccess']
    assertKnowledgebaseTaskWriteAccess: KnowledgebaseService['assertKnowledgebaseTaskWriteAccess']
    commandBus: CommandBus
    docTransformerRegistry: DocumentTransformerRegistry
    documentService: KnowledgeDocumentService
    knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver
    processTask: KnowledgebaseService['processTask']
    queryBus: QueryBus
    resolveKnowledgebaseFolderAncestors: KnowledgebaseService['resolveKnowledgebaseFolderAncestors']
    taskService: KnowledgebaseTaskService
    transformDocuments: KnowledgebaseService['transformDocuments']
}

export class KnowledgebaseTaskOperations {
    constructor(private readonly context: KnowledgebaseTaskOperationsContext) {}

    async createTask(knowledgebaseId: string, task: Partial<IKnowledgebaseTask>) {
        const knowledgebase = await this.context.assertKnowledgebaseTaskWriteAccess(knowledgebaseId)
        if (task.status === 'running') {
            if (knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) {
                throw new BadRequestException('Embedding rebuild is running')
            }
        }

        if (task.conversationId) {
            const conversation = await this.context.queryBus.execute(
                new AssertChatConversationAccessQuery({ id: task.conversationId }, 'contribute')
            )
            if (
                conversation.tenantId !== knowledgebase.tenantId ||
                (conversation.organizationId ?? null) !== (knowledgebase.organizationId ?? null)
            ) {
                throw knowledgebaseTaskAccessDenied()
            }
        }

        const documents = await this.resolveKnowledgebaseTaskDocuments(knowledgebaseId, task.documents)
        const context = await this.resolveKnowledgebaseTaskContext(knowledgebase, task.context)
        const safeTask: Partial<IKnowledgebaseTask> = {
            taskType: task.taskType,
            status: task.status,
            context,
            conversationId: task.conversationId,
            documents
        }

        const { id } = await this.context.taskService.createTask(knowledgebaseId, safeTask)
        const _task = await this.context.taskService.findOne(id, { relations: ['documents'] })
        if (task.status === 'running') {
            _task.documents.forEach((doc) => {
                doc.status = KBDocumentStatusEnum.WAITING
                doc.processMsg = null
            })
            // Update task status to running
            await this.context.documentService.save(_task.documents)
            // Start immediately
            await this.context.processTask(knowledgebaseId, _task.id, {
                sources: _task.documents?.reduce(
                    (obj, doc) => ({
                        ...obj,
                        [doc.sourceConfig.key]: {
                            documents: [...(obj[doc.sourceConfig.key]?.documents ?? []), doc.id]
                        }
                    }),
                    {}
                ),
                stage: 'prod',
                mode: task.context?.processingMode ?? 'full'
            })
        }
        return _task
    }

    async getTask(knowledgebaseId: string, taskId: string, params?: PaginationParams<KnowledgebaseTask>) {
        await this.context.assertKnowledgebaseTaskReadAccess(knowledgebaseId)
        assertSafeKnowledgebaseTaskRelations(params?.relations)
        const where = { ...(params?.where ?? {}), id: taskId, knowledgebaseId } as FindOptionsWhere<KnowledgebaseTask>

        return this.context.taskService.findOneByOptions({
            relations: params?.relations,
            where
        })
    }

    async processTask(
        knowledgebaseId: string,
        taskId: string,
        inputs: {
            sources?: { [key: string]: { documents: string[] } }
            stage: 'preview' | 'prod'
            mode?: KnowledgeDocumentProcessingMode
            options?: any
            isDraft?: boolean
        }
    ) {
        const kb = await this.context.assertKnowledgebaseTaskWriteAccess(knowledgebaseId, { relations: ['pipeline'] })
        if (kb.status === KnowledgebaseStatusEnum.REBUILDING) {
            throw new BadRequestException('Embedding rebuild is running')
        }
        const task = await this.context.taskService.findOneByOptions({
            where: { id: taskId, knowledgebaseId },
            relations: ['documents']
        })
        this.assertKnowledgebaseTaskSources(task, inputs.sources)
        const prepared = await prepareKnowledgePipelineDocuments(
            task,
            kb.pipeline?.graph,
            inputs,
            this.context.documentService,
            this.context.taskService
        )
        await dispatchKnowledgePipeline(
            this.context.commandBus,
            this.context.taskService,
            knowledgebaseId,
            kb.pipelineId,
            taskId,
            prepared
        )
    }

    async resolveKnowledgebaseTaskContext(
        knowledgebase: Knowledgebase,
        context: IKnowledgebaseTask['context']
    ): Promise<IKnowledgebaseTask['context']> {
        if (!context) {
            return undefined
        }

        const documents = context.documents
            ? await this.resolveKnowledgebaseTaskContextDocuments(knowledgebase, context.documents)
            : undefined
        return {
            ...(documents ? { documents } : {}),
            ...(context.processingMode ? { processingMode: context.processingMode } : {})
        }
    }

    async resolveKnowledgebaseTaskContextDocuments(
        knowledgebase: Knowledgebase,
        documents: Partial<IKnowledgeDocument>[]
    ): Promise<Partial<IKnowledgeDocument>[]> {
        const filesPath = this.context.knowledgeWorkAreaResolver.getFilesPath()
        const relativePaths = documents.map((document) =>
            resolveKnowledgebaseTaskFilePath(filesPath, document.filePath)
        )
        const workArea = await this.context.knowledgeWorkAreaResolver.resolve({
            tenantId: knowledgebase.tenantId,
            userId: RequestContext.currentUserId(),
            knowledgebaseId: knowledgebase.id
        })
        const files = new VolumeSubtreeClient(workArea.volume)

        return Promise.all(
            documents.map(async (document, index) => {
                const relativePath = relativePaths[index]
                const authorizedFile = await files.readFile(filesPath, relativePath, { metadataOnly: true })
                const parent = await this.resolveKnowledgebaseTaskDocumentParent(knowledgebase.id, document.parent)

                return {
                    id: document.id,
                    name: document.name,
                    type: document.type,
                    size: document.size,
                    category: document.category,
                    parserId: document.parserId,
                    parserConfig: document.parserConfig,
                    thumbnail: document.thumbnail,
                    options: document.options,
                    metadata: document.metadata,
                    ...(parent !== undefined ? { parent } : {}),
                    filePath: path.posix.join(filesPath, authorizedFile.filePath),
                    ...(authorizedFile.fileUrl ? { fileUrl: authorizedFile.fileUrl } : {}),
                    ...(authorizedFile.mimeType ? { mimeType: authorizedFile.mimeType } : {})
                }
            })
        )
    }

    async resolveKnowledgebaseTaskDocumentParent(knowledgebaseId: string, parent: IKnowledgeDocument['parent']) {
        if (parent === null || parent === undefined) {
            return parent
        }
        if (!parent.id) {
            throw knowledgebaseTaskAccessDenied()
        }

        const ancestors = await this.context.resolveKnowledgebaseFolderAncestors(knowledgebaseId, parent.id)
        const authorizedParent = ancestors[ancestors.length - 1]
        return { id: authorizedParent.id } as IKnowledgeDocument
    }

    async resolveKnowledgebaseTaskDocuments(
        knowledgebaseId: string,
        documents: IKnowledgebaseTask['documents']
    ): Promise<IKnowledgebaseTask['documents']> {
        if (!documents?.length) {
            return undefined
        }

        const documentIds = [
            ...new Set(
                documents
                    .map((document) => document.id)
                    .filter((documentId): documentId is string => typeof documentId === 'string' && !!documentId)
            )
        ]
        if (documentIds.length !== documents.length) {
            throw knowledgebaseTaskAccessDenied()
        }

        const result = await this.context.documentService.findAll({
            where: {
                id: In(documentIds),
                knowledgebaseId
            }
        })
        if (result.items.length !== documentIds.length) {
            throw knowledgebaseTaskAccessDenied()
        }

        return result.items
    }

    assertKnowledgebaseTaskSources(
        task: KnowledgebaseTask,
        sources: { [key: string]: { documents: string[] } } | undefined
    ): void {
        if (!sources) {
            return
        }

        const allowedDocumentIds = new Set([
            ...(task.documents ?? [])
                .map((document) => document.id)
                .filter((documentId): documentId is string => typeof documentId === 'string' && !!documentId),
            ...(task.context?.documents ?? [])
                .map((document) => document.id)
                .filter((documentId): documentId is string => typeof documentId === 'string' && !!documentId)
        ])
        const requestedDocumentIds = Object.values(sources).flatMap((source) => source.documents ?? [])
        if (requestedDocumentIds.some((documentId) => !allowedDocumentIds.has(documentId))) {
            throw knowledgebaseTaskAccessDenied()
        }
    }

    async previewFile(id: string, filePath: string) {
        const knowledgebase = await this.context.assertKnowledgebaseTaskReadAccess(id)
        const [document] = await this.resolveKnowledgebaseTaskContextDocuments(knowledgebase, [{ filePath }])
        const extension = document.filePath.split('.').pop().toLowerCase()
        try {
            const results = await this.context.transformDocuments(
                id,
                { provider: 'default', config: {} } as IWFNProcessor,
                false,
                [
                    {
                        filePath: document.filePath,
                        fileUrl: document.fileUrl,
                        mimeType: document.mimeType,
                        name: document.filePath.split('/').pop(),
                        type: extension,
                        category: classificateDocumentCategory({ type: extension })
                    }
                ]
            )
            return results[0].chunks
        } catch (error) {
            throw new InternalServerErrorException(getErrorMessage(error))
        }
    }

    async transformDocuments(
        knowledgebaseId: string,
        entity: IWFNProcessor,
        isDraft: boolean,
        input: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>[],
        options?: {
            taskId?: string | null
            documentId?: string | null
        }
    ) {
        const strategy = this.context.docTransformerRegistry.get(entity.provider)
        const workArea = await this.context.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId,
            taskId: options?.taskId,
            documentId: options?.documentId
        })

        const permissions = await this.context.commandBus.execute(
            new PluginPermissionsCommand(strategy.permissions, {
                knowledgebaseId: knowledgebaseId,
                integrationId: entity.integrationId,
                folder: ''
            })
        )

        const results = await strategy
            .transformDocuments(
                input.map((document) => ({ ...document, type: knowledgeDocumentFileType(document) })),
                {
                    ...(entity.config ?? {}),
                    stage: isDraft ? 'test' : 'prod',
                    tempDir: workArea.tmpPath.serverPath,
                    fileScope: {
                        tenantId: RequestContext.currentTenantId(),
                        organizationId: RequestContext.getOrganizationId(),
                        userId: RequestContext.currentUserId(),
                        catalog: 'knowledges' as const,
                        knowledgeId: knowledgebaseId,
                        scopeId: knowledgebaseId
                    },
                    permissions
                }
            )
            .catch(rethrowParserError)

        return results
    }

    async resolveKnowledgebaseFolderAncestors(knowledgebaseId: string, parentId: string) {
        const parent = await this.context.documentService.findOne(parentId)
        if (parent.knowledgebaseId !== knowledgebaseId || parent.sourceType !== KDocumentSourceType.FOLDER) {
            throw new BadRequestException('parentId must point to a folder in the selected knowledgebase')
        }

        const ancestors = await this.context.documentService.findAncestors(parent.id)
        if (ancestors.some((ancestor) => ancestor.knowledgebaseId !== knowledgebaseId)) {
            throw new BadRequestException('parentId must point to a folder in the selected knowledgebase')
        }
        return ancestors
    }
}
