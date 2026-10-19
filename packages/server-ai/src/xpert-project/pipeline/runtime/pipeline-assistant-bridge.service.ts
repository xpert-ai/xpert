import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { projectPipelineAssistantInputSchema, type ProjectPipelineOperationReceipt } from '@xpert-ai/contracts'
import {
    AssistantTaskRuntimeCapability,
    RequestContext,
    XPERT_RUNTIME_CAPABILITIES_TOKEN,
    ProjectPipelineRuntimeAdapterRegistry,
    type RuntimeCapabilityRegistry,
    type ProjectPipelineContext,
    type AgentMiddlewareAssistantTaskResult
} from '@xpert-ai/plugin-sdk'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { ProjectPipelineOperationStore, type PipelineOperationClaim } from './pipeline-operation.store'
import { lockManagedProject } from './pipeline-transaction'
import { pipelineAssistantIntentSchema } from './pipeline-assistant-intent.schema'
import { readPipelineModelBudgetDenial } from '../budget/pipeline-model-budget-denial'

/** Native Assistant Task owns execution and Invocation persistence. Pipeline owns only the governed intent and acceptance. */
@Injectable()
export class ProjectPipelineAssistantBridgeService {
    constructor(
        @InjectRepository(ProjectPipelineOperationEntity)
        private readonly operations: Repository<ProjectPipelineOperationEntity>,
        private readonly access: XpertProjectAccessService,
        private readonly published: PublishedXpertAccessService,
        private readonly store: ProjectPipelineOperationStore,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry
    ) {}

    async resolve(context: ProjectPipelineContext, selectionKey: string) {
        // Queue processing restores this actor. An explicit capability actor cannot override a different credential audience.
        if (
            RequestContext.currentUserId() !== context.actor.userId ||
            RequestContext.currentTenantId() !== context.actor.tenantId ||
            (RequestContext.getOrganizationId() ?? null) !== (context.actor.organizationId ?? null)
        )
            throw pipelineProjectionConflict('EXECUTOR_ACTOR_CONTEXT_MISMATCH')
        const xpertId = z.string().uuid().parse(selectionKey)
        await this.access.assertCanUseXpert(context.projectId, xpertId, {
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId,
            userId: context.actor.userId
        })
        const assistant = await this.published.getAccessiblePublishedXpert(xpertId)
        if (
            assistant.tenantId !== context.actor.tenantId ||
            assistant.organizationId !== context.actor.organizationId ||
            !assistant.workspaceId
        )
            throw pipelineProjectionConflict('EXECUTOR_SCOPE_MISMATCH')
        return {
            xpertId: assistant.id,
            workspaceId: assistant.workspaceId,
            publishedVersion: assistant.version || assistant.id
        }
    }

    async candidate(context: ProjectPipelineContext, selectionKey: string) {
        const target = await this.resolve(context, selectionKey)
        const assistant = await this.published.getAccessiblePublishedXpert(target.xpertId)
        return {
            id: target.xpertId,
            name: assistant.title || assistant.name || assistant.id,
            publishedVersion: target.publishedVersion
        }
    }

    async observe(
        context: ProjectPipelineContext,
        claim: PipelineOperationClaim,
        workerId: string,
        selectionKey: string
    ): Promise<ProjectPipelineOperationReceipt> {
        const operation = claim.operation,
            scope = projectionScope(context)
        const row = await this.operations
            .createQueryBuilder('operation')
            .addSelect('operation.assistantIntent')
            .where({ ...scope, id: operation.id })
            .getOneOrFail()
        let intent = row.assistantIntent ? pipelineAssistantIntentSchema.parse(row.assistantIntent) : null
        const target = await this.resolve(context, selectionKey)
        const adapter = this.adapters.resolve('assistant_operation', operation.handlerRef, context.actor)
        if (claim.mode === 'execute') {
            if (!intent) {
                const executor = {
                    ...target,
                    executionId: operation.id,
                    conversationId: pipelineIdentity(context, 'assistant-conversation', operation.id)
                }
                const input = projectPipelineAssistantInputSchema.parse(
                    await adapter.prepare({ ...operation.context, executor })
                )
                const proposed = pipelineAssistantIntentSchema.parse({ ...executor, input })
                intent = await this.operations.manager.transaction(async (manager) => {
                    await lockManagedProject(manager, context)
                    const current = await manager
                        .getRepository(ProjectPipelineOperationEntity)
                        .createQueryBuilder('operation')
                        .addSelect('operation.assistantIntent')
                        .where({ ...scope, id: operation.id })
                        .getOneOrFail()
                    if (
                        current.leaseOwner !== workerId ||
                        current.leaseFence !== claim.fence ||
                        current.state !== 'dispatching'
                    )
                        throw pipelineProjectionConflict('OPERATION_LEASE_EXPIRED')
                    if (current.assistantIntent && pipelineDigest(current.assistantIntent) !== pipelineDigest(proposed))
                        throw pipelineProjectionConflict('OPERATION_INPUT_IMMUTABLE')
                    current.assistantIntent = proposed
                    await manager.save(current)
                    return proposed
                })
            }
        }
        if (!intent) return { status: 'unknown', receiptKey: operation.id }
        if (
            claim.mode === 'execute' &&
            (intent.xpertId !== target.xpertId ||
                intent.workspaceId !== target.workspaceId ||
                intent.publishedVersion !== target.publishedVersion)
        )
            throw pipelineProjectionConflict('EXECUTOR_VERSION_CHANGED')
        const api = this.capabilities.require(AssistantTaskRuntimeCapability)
        if (!api.getTaskStatus) throw pipelineProjectionConflict('EXECUTOR_INSPECTION_UNAVAILABLE')
        let native: AgentMiddlewareAssistantTaskResult | null
        if (claim.mode === 'execute') {
            if (!(await this.store.beginDispatch(context, operation.id, workerId, claim.fence)))
                return { status: 'unknown', receiptKey: operation.id }
            native = await api.startTask({
                ...intent.input,
                prompt: intent.input.prompt,
                xpertId: intent.xpertId,
                projectId: context.projectId,
                executionId: intent.executionId,
                conversationId: intent.conversationId,
                clientMessageId: operation.id,
                expectedPublishedVersion: intent.publishedVersion
            })
        } else
            native = await api.getTaskStatus({
                xpertId: intent.xpertId,
                executionId: intent.executionId,
                conversationId: intent.conversationId,
                clientMessageId: operation.id
            })
        if (!native) return { status: 'unknown', receiptKey: operation.id }
        if (
            (native.executionId && native.executionId !== intent.executionId) ||
            (native.conversationId && native.conversationId !== intent.conversationId) ||
            (native.executorXpertId && native.executorXpertId !== intent.xpertId) ||
            (native.executorPublishedVersion && native.executorPublishedVersion !== intent.publishedVersion)
        )
            throw pipelineProjectionConflict('EXECUTOR_RECEIPT_IDENTITY_CHANGED')
        const execution = {
            kind: 'assistant_task' as const,
            executionId: intent.executionId,
            conversationId: intent.conversationId,
            xpertId: intent.xpertId,
            publishedVersion: intent.publishedVersion,
            status: native.status === 'interrupted' ? ('waiting' as const) : native.status
        }
        if (native.status === 'failed')
            return {
                status: 'failed',
                receiptKey: operation.id,
                code:
                    (await readPipelineModelBudgetDenial(this.operations.manager, context, operation.id)) ??
                    'ASSISTANT_EXECUTION_FAILED',
                execution
            }
        if (native.status === 'unknown') return { status: 'unknown', receiptKey: operation.id, execution }
        if (native.status !== 'succeeded') return { status: 'pending', receiptKey: operation.id, execution }
        try {
            return {
                status: 'succeeded',
                receiptKey: operation.id,
                execution,
                outputs: await adapter.collect({
                    ...operation.context,
                    executor: {
                        xpertId: intent.xpertId,
                        workspaceId: intent.workspaceId,
                        publishedVersion: intent.publishedVersion,
                        executionId: intent.executionId,
                        conversationId: intent.conversationId
                    }
                })
            }
        } catch {
            return { status: 'unknown', receiptKey: operation.id, execution }
        }
    }

    async cancel(
        context: ProjectPipelineContext,
        claim: PipelineOperationClaim,
        workerId: string,
        selectionKey: string
    ): Promise<ProjectPipelineOperationReceipt> {
        await this.resolve(context, selectionKey)
        const row = await this.operations
            .createQueryBuilder('operation')
            .addSelect('operation.assistantIntent')
            .where({ ...projectionScope(context), id: claim.operation.id })
            .getOneOrFail()
        if (!row.assistantIntent) return { status: 'unknown', receiptKey: row.id }
        const intent = pipelineAssistantIntentSchema.parse(row.assistantIntent)
        const api = this.capabilities.require(AssistantTaskRuntimeCapability)
        if (!(await this.store.beginCancel(context, row.id, workerId, claim.fence)))
            return { status: 'unknown', receiptKey: row.id }
        if (!api.cancelTask) return this.observe(context, { ...claim, mode: 'inspect' }, workerId, selectionKey)
        const result = await api.cancelTask({
            xpertId: intent.xpertId,
            executionId: intent.executionId,
            conversationId: intent.conversationId,
            clientMessageId: row.id
        })
        if (!result.canceledExecutionIds.includes(intent.executionId)) return { status: 'unknown', receiptKey: row.id }
        return {
            status: 'cancelled',
            receiptKey: row.id,
            execution: {
                kind: 'assistant_task',
                xpertId: intent.xpertId,
                executionId: intent.executionId,
                conversationId: intent.conversationId,
                publishedVersion: intent.publishedVersion,
                status: 'cancelled'
            }
        }
    }
}
