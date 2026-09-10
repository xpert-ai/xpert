import {
    IKnowledgebaseTask,
    IKnowledgeDocument,
    KBDocumentStatusEnum,
    TaskStep,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, IsNull, Repository } from 'typeorm'
import { KnowledgebaseTask } from './task.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { t } from 'i18next'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'

export interface KnowledgePipelineExecutionScope {
    tenantId: string
    organizationId: string | null
    knowledgebaseId: string
    taskId: string
    executionId: string
}

function knowledgebaseTaskAccessDeniedMessage() {
    return t('server-ai:Error.KnowledgebaseTaskAccessDenied', {
        defaultValue: 'You do not have access to this knowledgebase task'
    })
}

@Injectable()
export class KnowledgebaseTaskService extends TenantOrganizationAwareCrudService<KnowledgebaseTask> {
    readonly #logger = new Logger(KnowledgebaseTaskService.name)

    @InjectRepository(Knowledgebase)
    private readonly baseRepo: Repository<Knowledgebase>

    constructor(
        @InjectRepository(KnowledgebaseTask)
        private readonly taskRepo: Repository<KnowledgebaseTask>
    ) {
        super(taskRepo)
    }

    /**
     * Create a new task for a knowledgebase
     */
    async createTask(knowledgebaseId: string, entity: Partial<IKnowledgebaseTask>): Promise<KnowledgebaseTask> {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new ForbiddenException(knowledgebaseTaskAccessDeniedMessage())
        }
        const knowledgebase = await this.baseRepo.findOne({
            where: {
                id: knowledgebaseId,
                tenantId,
                organizationId: RequestContext.getOrganizationId() ?? IsNull()
            }
        })
        if (!knowledgebase) {
            throw new NotFoundException(knowledgebaseTaskAccessDeniedMessage())
        }

        const steps: TaskStep[] = [
            // { name: 'load', status: 'pending', progress: 0 },
            // { name: 'preprocess', status: 'pending', progress: 0 },
            // { name: 'split', status: 'pending', progress: 0 },
            // { name: 'embed', status: 'pending', progress: 0 },
            // { name: 'store', status: 'pending', progress: 0 }
        ]

        const task = await this.create({
            ...entity,
            knowledgebase,
            status: 'pending',
            steps
        })

        return task
    }

    /**
     * Update or insert documents context cache into task
     *
     * @param id
     * @param documents
     */
    async upsertDocuments(id: string, documents: Partial<IKnowledgeDocument>[]): Promise<IKnowledgebaseTask> {
        const task = await this.findOneByIdString(id)

        task.context ??= {}
        // Upsert documents
        const docMap = new Map(task.context.documents?.map((doc) => [doc.id, doc]))
        for (const doc of documents) {
            if (doc.id) {
                docMap.set(doc.id, {
                    ...(docMap.get(doc.id) || {}),
                    ...doc
                } as IKnowledgeDocument)
            } else {
                this.#logger.warn(`Document without id cannot be upserted into task ${id}`)
            }
        }
        const updatedDocuments = Array.from(docMap.values())
        task.context.documents = updatedDocuments
        return await this.taskRepo.save(task)
    }

    async syncExecutionFailure(scope: KnowledgePipelineExecutionScope): Promise<void> {
        if (!scope.tenantId) throw new ForbiddenException(knowledgebaseTaskAccessDeniedMessage())
        const execution = await this.taskRepo.manager.findOne(XpertAgentExecution, {
            where: {
                id: scope.executionId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? IsNull()
            },
            select: { status: true, error: true }
        })
        if (execution?.status === XpertAgentExecutionStatusEnum.ERROR) {
            await this.failExecution(
                scope,
                execution.error ||
                    t('server-ai:Error.KnowledgePipelineFailed', {
                        defaultValue: 'Knowledge pipeline execution failed'
                    })
            )
        }
    }

    /** Serialize materialization for one task and commit its documents and bindings together. */
    async withLockedTask<T>(
        taskId: string,
        work: (task: KnowledgebaseTask, manager: EntityManager) => Promise<T>
    ): Promise<T> {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) throw new ForbiddenException(knowledgebaseTaskAccessDeniedMessage())
        return this.taskRepo.manager.transaction(async (manager) => {
            const task = await manager.findOne(KnowledgebaseTask, {
                where: { id: taskId, tenantId, organizationId: RequestContext.getOrganizationId() ?? IsNull() },
                lock: { mode: 'pessimistic_write' }
            })
            if (!task) throw new NotFoundException(knowledgebaseTaskAccessDeniedMessage())
            // Load relations separately: PostgreSQL cannot lock the nullable side of an outer join.
            const related = await manager.findOne(KnowledgebaseTask, {
                where: { id: task.id, tenantId, organizationId: RequestContext.getOrganizationId() ?? IsNull() },
                relations: ['documents']
            })
            task.documents = related?.documents ?? []
            return work(task, manager)
        })
    }

    async savePreparedSource(
        taskId: string,
        sourceKey: string,
        bindings: Record<string, string>,
        documents: IKnowledgeDocument[],
        prepared?: { task: KnowledgebaseTask; manager: EntityManager }
    ): Promise<void> {
        const task = prepared?.task ?? (await this.findOneByIdString(taskId, { relations: ['documents'] }))
        const documentIds = new Set([...(task.documents ?? []).map((doc) => doc.id), ...documents.map((doc) => doc.id)])
        const saved = await (prepared?.manager.getRepository(KnowledgebaseTask) ?? this.taskRepo).save({
            id: task.id,
            context: {
                ...task.context,
                materializedSources: { ...task.context?.materializedSources, [sourceKey]: bindings }
            },
            documents: Array.from(documentIds, (id) => ({ id }))
        })
        if (prepared) {
            task.context = saved.context
            task.documents = saved.documents
        }
    }

    /** Claim documents before enqueueing; later callbacks must match this exact execution. */
    async startDocumentExecution(taskId: string, executionId: string, documentIds?: string[]): Promise<void> {
        await this.withLockedTask(taskId, async (task, manager) => {
            const ids = (task.documents ?? [])
                .map((doc) => doc.id)
                .filter((id) => !documentIds || documentIds.includes(id))
            await manager.update(
                KnowledgebaseTask,
                { id: task.id },
                {
                    status: 'running',
                    executionId,
                    error: null,
                    finishedAt: null
                }
            )
            if (ids.length) {
                await manager.update(
                    KnowledgeDocument,
                    {
                        id: In(ids),
                        knowledgebaseId: task.knowledgebaseId,
                        tenantId: RequestContext.currentTenantId(),
                        organizationId: RequestContext.getOrganizationId() ?? IsNull()
                    },
                    {
                        processingExecutionId: executionId,
                        status: KBDocumentStatusEnum.WAITING,
                        processMsg: null,
                        progress: 0
                    }
                )
            }
        })
    }

    async failExecution(scope: KnowledgePipelineExecutionScope, error: string): Promise<void> {
        if (!scope.tenantId) throw new ForbiddenException(knowledgebaseTaskAccessDeniedMessage())
        await this.taskRepo.manager.transaction(async (manager) => {
            const result = await manager.update(
                KnowledgebaseTask,
                {
                    id: scope.taskId,
                    knowledgebaseId: scope.knowledgebaseId,
                    executionId: scope.executionId,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId ?? IsNull(),
                    status: 'running'
                },
                { status: 'failed', error, finishedAt: new Date() }
            )
            // Ignore duplicate callbacks and failures from a previous attempt.
            if (!result.affected) return
            await manager.update(
                XpertAgentExecution,
                {
                    id: scope.executionId,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId ?? IsNull(),
                    status: XpertAgentExecutionStatusEnum.RUNNING
                },
                { status: XpertAgentExecutionStatusEnum.ERROR, error }
            )
            const task = await manager.findOne(KnowledgebaseTask, {
                where: {
                    id: scope.taskId,
                    knowledgebaseId: scope.knowledgebaseId,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId ?? IsNull()
                },
                relations: ['documents'],
                select: { id: true, documents: { id: true } }
            })
            if (task?.documents?.length) {
                // Imports are visible before dispatch; a failed dispatch must not leave their rows waiting forever.
                await manager.update(
                    KnowledgeDocument,
                    {
                        id: In(task.documents.map((document) => document.id)),
                        processingExecutionId: scope.executionId,
                        knowledgebaseId: scope.knowledgebaseId,
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId ?? IsNull(),
                        status: In([
                            KBDocumentStatusEnum.WAITING,
                            KBDocumentStatusEnum.RUNNING,
                            KBDocumentStatusEnum.TRANSFORMED,
                            KBDocumentStatusEnum.SPLITTED,
                            KBDocumentStatusEnum.UNDERSTOOD,
                            KBDocumentStatusEnum.EMBEDDING
                        ])
                    },
                    { status: KBDocumentStatusEnum.ERROR, processMsg: error }
                )
            }
        })
    }
}
