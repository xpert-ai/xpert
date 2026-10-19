// Provenance is checked against durable work, never inferred from a caller-supplied Project or display name.
// Observation of old rounds remains possible; this authorization does not grant a new dispatch lease.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { projectPipelineConfigurationSchema, projectPipelineWorkContextSchema } from '@xpert-ai/contracts'
import { projectPipelineInvocationScopeSchema } from '@xpert-ai/plugin-sdk'
import { AgentRuntimeBindingEntity } from '../../../agent-invocation/invocation.entity'
import { XpertProject } from '../../entities/project.entity'
import { XpertWorkspace } from '../../../xpert-workspace/workspace.entity'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineOperationEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineRoundEntity
} from '../persistence/pipeline.entity'
import { pipelineDigest } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { AuthorizeProjectPipelineRuntimeCommand } from './pipeline-runtime-access.command'

@CommandHandler(AuthorizeProjectPipelineRuntimeCommand)
export class AuthorizeProjectPipelineRuntimeHandler implements ICommandHandler<AuthorizeProjectPipelineRuntimeCommand> {
    constructor(
        @InjectRepository(ProjectPipelineOperationEntity)
        private readonly operations: Repository<ProjectPipelineOperationEntity>,
        private readonly access: ProjectAccessRuntimeService
    ) {}

    async execute(command: AuthorizeProjectPipelineRuntimeCommand) {
        const parsed = projectPipelineInvocationScopeSchema.safeParse(command.scope)
        if (!parsed.success) throw pipelineProjectionConflict('EXECUTOR_SCOPE_MISMATCH')
        const scope = parsed.data
        const actor = { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId }
        await this.access.assertEdit({ actor, projectId: scope.projectId })
        const where = projectionScope({ actor, projectId: scope.projectId }),
            manager = this.operations.manager
        const project = await manager.findOneBy(XpertProject, {
            id: scope.projectId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId
        })
        const runtimeBinding = await manager.findOneBy(AgentRuntimeBindingEntity, {
            id: command.bindingId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            enabled: true
        })
        const operation = await this.operations.findOneBy({ ...where, id: scope.pipelineOrigin.operationId })
        const workspace = await manager.findOneBy(XpertWorkspace, {
            id: scope.workspaceId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId
        })
        if (
            !project ||
            !workspace ||
            workspace.status === 'archived' ||
            !runtimeBinding ||
            !runtimeBinding.workspaceIds.includes(scope.workspaceId) ||
            !operation ||
            operation.kind !== 'operation' ||
            operation.context.projectId !== scope.projectId ||
            operation.context.actor.userId !== actor.userId ||
            operation.context.actor.tenantId !== actor.tenantId ||
            operation.context.actor.organizationId !== actor.organizationId ||
            pipelineDigest(projectPipelineWorkContextSchema.parse(operation.context.work)) !==
                pipelineDigest(scope.pipelineOrigin) ||
            operation.instanceId !== scope.pipelineOrigin.instanceId ||
            operation.runId !== scope.pipelineOrigin.runId ||
            operation.roundId !== scope.pipelineOrigin.roundId ||
            operation.nodeInstanceId !== scope.pipelineOrigin.nodeInstanceId
        )
            throw pipelineProjectionConflict('EXECUTOR_SCOPE_MISMATCH')
        if (command.phase === 'dispatch') {
            const now = ((await manager.query('SELECT clock_timestamp() AS now')) as Array<{ now: Date }>)[0].now
            if (
                !operation.dispatchStartedAt ||
                operation.leaseFence < 1 ||
                !operation.leaseOwner ||
                !operation.leaseExpiresAt ||
                operation.leaseExpiresAt <= now ||
                operation.cancelRequestedAt ||
                operation.state !== 'dispatching'
            )
                throw pipelineProjectionConflict('OPERATION_DISPATCH_NOT_AUTHORIZED')
        }
        const run = await manager.findOneBy(ProjectPipelineRunEntity, {
            ...where,
            id: operation.runId,
            instanceId: operation.instanceId
        })
        const node = await manager.findOneBy(ProjectPipelineNodeEntity, {
            ...where,
            id: operation.nodeInstanceId,
            roundId: operation.roundId
        })
        const definition =
            run && (await manager.findOneBy(ProjectPipelineDefinitionEntity, { ...where, id: run.definitionId }))
        if (!run || !node || !definition) throw pipelineProjectionConflict('EXECUTOR_SCOPE_MISMATCH')
        if (command.phase === 'dispatch') {
            const instance = await manager.findOneBy(ProjectPipelineInstanceEntity, {
                ...where,
                id: operation.instanceId
            })
            const round = await manager.findOneBy(ProjectPipelineRoundEntity, {
                ...where,
                id: operation.roundId,
                runId: operation.runId
            })
            if (
                !round ||
                round.state !== 'active' ||
                round.generation !== scope.pipelineOrigin.generation ||
                round.inputDigest !== scope.pipelineOrigin.inputDigest ||
                node.projection.state.freshness !== 'current' ||
                !instance ||
                instance.currentRunId !== operation.runId ||
                instance.currentRoundId !== operation.roundId ||
                node.disposition !== 'active' ||
                !['active', 'pending', 'waiting'].includes(run.state)
            )
                throw pipelineProjectionConflict('OPERATION_DISPATCH_NOT_AUTHORIZED')
        }
        const { template, binding } = projectPipelineConfigurationSchema.parse({
            schemaVersion: 1,
            template: definition.definition,
            binding: run.bindingSnapshot
        })
        const spec =
            template.executionAuthority === 'platform' && template.nodes.find((item) => item.key === node.nodeKey)
        const executor = spec && spec.kind === 'work' && binding.executorBindings?.[spec.executorSlot]
        if (
            !spec ||
            spec.kind !== 'work' ||
            spec.operationRef !== operation.handlerRef ||
            !executor ||
            executor.kind !== 'runtime_binding' ||
            executor.selectionKey !== command.bindingId ||
            (executor.workspaceId ??
                (runtimeBinding.workspaceIds.length === 1 ? runtimeBinding.workspaceIds[0] : undefined)) !==
                scope.workspaceId
        )
            throw pipelineProjectionConflict('EXECUTOR_SCOPE_MISMATCH')
    }
}
