// Persist the exact request before dispatch. Unknown launches are inspected by the original Invocation ID.
// The Runtime owns process effects; a successful result is still subject to Pipeline evidence and acceptance.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { projectPipelineRuntimeInputSchema, type ProjectPipelineOperationReceipt } from '@xpert-ai/contracts'
import {
    ProjectPipelineRuntimeAdapterRegistry,
    RequestContext,
    type AgentInvocation,
    type AgentInvocationScope,
    type ProjectPipelineContext,
    type ProjectPipelineRuntimeContext
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationFactoryService } from '../../../agent-invocation/invocation-factory.service'
import { agentInvocationId, sameInvocationData } from '../../../agent-invocation/invocation-runtime'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { ProjectPipelineOperationStore, type PipelineOperationClaim } from './pipeline-operation.store'
import { lockManagedProject } from './pipeline-transaction'
import { pipelineRuntimeIntentSchema, type PipelineRuntimeIntent } from './pipeline-runtime-intent.schema'

@Injectable()
export class ProjectPipelineRuntimeBridgeService {
    constructor(
        @InjectRepository(ProjectPipelineOperationEntity)
        private readonly operations: Repository<ProjectPipelineOperationEntity>,
        private readonly factory: AgentInvocationFactoryService,
        private readonly store: ProjectPipelineOperationStore,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry
    ) {}

    private assertActor(context: ProjectPipelineContext) {
        if (
            RequestContext.currentUserId() !== context.actor.userId ||
            RequestContext.currentTenantId() !== context.actor.tenantId ||
            (RequestContext.getOrganizationId() ?? null) !== (context.actor.organizationId ?? null)
        )
            throw pipelineProjectionConflict('EXECUTOR_ACTOR_CONTEXT_MISMATCH')
        if (RequestContext.currentApiPrincipal()?.principalType === 'client_secret')
            throw pipelineProjectionConflict('EXECUTOR_SCOPE_MISMATCH')
    }

    async candidates(context: ProjectPipelineContext) {
        this.assertActor(context)
        return this.factory.listProjectPipelineBindings(context.actor, context.projectId)
    }

    async resolve(context: ProjectPipelineContext, selectionKey: string, workspaceId?: string) {
        this.assertActor(context)
        return this.factory.resolveProjectPipelineTarget(context.actor, context.projectId, selectionKey, workspaceId)
    }

    private async stored(context: ProjectPipelineContext, id: string) {
        const row = await this.operations
            .createQueryBuilder('operation')
            .addSelect('operation.runtimeIntent')
            .where({ ...projectionScope(context), id })
            .getOneOrFail()
        return row.runtimeIntent ? pipelineRuntimeIntentSchema.parse(row.runtimeIntent) : null
    }

    async observe(
        context: ProjectPipelineContext,
        claim: PipelineOperationClaim,
        workerId: string,
        selectionKey: string,
        selectedWorkspaceId?: string
    ): Promise<ProjectPipelineOperationReceipt> {
        const operation = claim.operation
        let intent = await this.stored(context, operation.id)
        if (claim.mode === 'execute' && !intent) {
            const { workspaceId, target } = await this.resolve(context, selectionKey, selectedWorkspaceId)
            const scope: AgentInvocationScope = {
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId,
                userId: context.actor.userId,
                projectId: context.projectId,
                workspaceId,
                callerType: 'project_pipeline',
                callerAgentKey: 'pipeline_node',
                parentExecutionId: `pipeline-operation:${operation.id}`,
                pipelineOrigin: operation.context.work
            }
            const invocationId = agentInvocationId(scope, operation.id)
            const executor = {
                bindingId: target.bindingId,
                provider: target.provider,
                revision: target.revision,
                reference: target.reference,
                invocationId
            }
            const input = projectPipelineRuntimeInputSchema.parse(
                await this.adapters
                    .resolve('runtime_operation', operation.handlerRef, context.actor)
                    .prepare({ ...operation.context, executor })
            )
            const proposed = pipelineRuntimeIntentSchema.parse({ scope, target, invocationId, input })
            intent = await this.operations.manager.transaction(async (manager) => {
                await lockManagedProject(manager, context)
                const row = await manager
                    .getRepository(ProjectPipelineOperationEntity)
                    .createQueryBuilder('operation')
                    .addSelect('operation.runtimeIntent')
                    .where({ ...projectionScope(context), id: operation.id })
                    .getOneOrFail()
                if (row.leaseOwner !== workerId || row.leaseFence !== claim.fence || row.state !== 'dispatching')
                    throw pipelineProjectionConflict('OPERATION_LEASE_EXPIRED')
                if (row.runtimeIntent && !sameInvocationData(row.runtimeIntent, proposed))
                    throw pipelineProjectionConflict('OPERATION_INPUT_IMMUTABLE')
                row.runtimeIntent = proposed
                await manager.save(row)
                return proposed
            })
        }
        if (!intent) return { status: 'unknown', receiptKey: operation.id }
        const scope = runtimeScope(intent),
            api = this.factory.createCapturedApi(scope)
        if (
            selectionKey !== intent.target.bindingId ||
            (selectedWorkspaceId && selectedWorkspaceId !== scope.workspaceId) ||
            agentInvocationId(scope, operation.id) !== intent.invocationId
        )
            throw pipelineProjectionConflict('EXECUTOR_RECEIPT_IDENTITY_CHANGED')
        let invocation: AgentInvocation
        if (claim.mode === 'execute') {
            const target = await api.resolve(selectionKey)
            if (!sameInvocationData(target, intent.target)) throw pipelineProjectionConflict('EXECUTOR_VERSION_CHANGED')
            if (!(await this.store.beginDispatch(context, operation.id, workerId, claim.fence)))
                return { status: 'unknown', receiptKey: operation.id }
            invocation = await api.start({
                target,
                callId: operation.id,
                input: { ...intent.input, prompt: intent.input.prompt }
            })
        } else invocation = await api.inspect(intent.invocationId)
        return this.receipt(context, claim, intent, invocation)
    }

    async cancel(
        context: ProjectPipelineContext,
        claim: PipelineOperationClaim,
        workerId: string,
        selectionKey: string
    ): Promise<ProjectPipelineOperationReceipt> {
        const intent = await this.stored(context, claim.operation.id)
        if (!intent) return { status: 'unknown', receiptKey: claim.operation.id }
        if (selectionKey !== intent.target.bindingId)
            throw pipelineProjectionConflict('EXECUTOR_RECEIPT_IDENTITY_CHANGED')
        if (!(await this.store.beginCancel(context, claim.operation.id, workerId, claim.fence)))
            return { status: 'unknown', receiptKey: claim.operation.id }
        const invocation = await this.factory.createCapturedApi(runtimeScope(intent)).cancel(intent.invocationId)
        return this.receipt(context, claim, intent, invocation)
    }

    private async receipt(
        context: ProjectPipelineContext,
        claim: PipelineOperationClaim,
        intent: PipelineRuntimeIntent,
        invocation: AgentInvocation
    ): Promise<ProjectPipelineOperationReceipt> {
        const operation = claim.operation
        if (
            invocation.id !== intent.invocationId ||
            invocation.request.callId !== operation.id ||
            !sameInvocationData(invocation.scope, intent.scope) ||
            !sameInvocationData(invocation.request.target, intent.target) ||
            !sameInvocationData(invocation.request.input, intent.input)
        )
            throw pipelineProjectionConflict('EXECUTOR_RECEIPT_IDENTITY_CHANGED')
        const execution = {
            kind: 'runtime_invocation' as const,
            invocationId: invocation.id,
            bindingId: intent.target.bindingId,
            provider: intent.target.provider,
            revision: intent.target.revision,
            status: invocation.status
        }
        const receiptKey = operation.id
        if (invocation.status === 'failed')
            return { status: 'failed', receiptKey, execution, code: 'RUNTIME_EXECUTION_FAILED' }
        if (invocation.status === 'cancelled') return { status: 'cancelled', receiptKey, execution }
        if (invocation.status === 'unknown') return { status: 'unknown', receiptKey, execution }
        if (invocation.status !== 'succeeded') return { status: 'pending', receiptKey, execution }
        if (!invocation.result) return { status: 'unknown', receiptKey, execution }
        const executor: ProjectPipelineRuntimeContext['executor'] = {
            bindingId: intent.target.bindingId,
            provider: intent.target.provider,
            revision: intent.target.revision,
            reference: intent.target.reference,
            invocationId: intent.invocationId
        }
        try {
            return {
                status: 'succeeded',
                receiptKey,
                execution,
                outputs: await this.adapters
                    .resolve('runtime_operation', operation.handlerRef, context.actor)
                    .collect({ ...operation.context, executor }, invocation.result)
            }
        } catch {
            return { status: 'unknown', receiptKey, execution }
        }
    }
}

function runtimeScope(intent: PipelineRuntimeIntent): AgentInvocationScope {
    const scope = intent.scope
    return {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        projectId: scope.projectId,
        workspaceId: scope.workspaceId,
        callerType: 'project_pipeline',
        callerAgentKey: 'pipeline_node',
        parentExecutionId: scope.parentExecutionId,
        pipelineOrigin: scope.pipelineOrigin
    }
}
