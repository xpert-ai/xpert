// A provider dispatch lease can bind one exact native execution per call key. Inspection cannot mint grants.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { projectPipelineNativeSourceSchema } from '@xpert-ai/contracts'
import { ProjectPipelineNativeGrantEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineProviderActionStore } from '../provider-actions/provider-action.store'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { lockManagedProject, managedAudit } from './pipeline-transaction'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { pipelineNativeGrantTarget } from './pipeline-native-grant-target'
import { assertPipelineDispatchEnabled } from './pipeline-dispatch-policy'
import {
    AuthorizePipelineNativeExecutionCommand,
    PreparePipelineNativeExecutionCommand,
    type PipelineNativeGrantRequest
} from './pipeline-native-grant.command'

const inputSchema = z
    .object({
        actor: z
            .object({
                tenantId: z.string().uuid(),
                organizationId: z.string().uuid().nullish(),
                userId: z.string().uuid()
            })
            .strict(),
        projectId: z.string().uuid(),
        source: projectPipelineNativeSourceSchema,
        executionId: z.string().uuid(),
        conversationId: z.string().uuid(),
        xpertId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        publishedVersion: z.string().min(1).max(200),
        inputDigest: z.string().regex(/^[a-f0-9]{64}$/)
    })
    .strict()

@Injectable()
export class ProjectPipelineNativeGrantStore {
    constructor(
        private readonly db: DataSource,
        private readonly actions: ProjectPipelineProviderActionStore,
        private readonly access: XpertProjectAccessService,
        private readonly published: PublishedXpertAccessService,
        private readonly projectAccess: ProjectAccessRuntimeService
    ) {}

    prepare(input: PipelineNativeGrantRequest) {
        return this.write(input, false)
    }
    consume(input: PipelineNativeGrantRequest) {
        return this.write(input, true)
    }
    private async write(input: PipelineNativeGrantRequest, dispatch: boolean) {
        inputSchema.parse(input)
        const { actor, projectId, source } = input,
            context = { actor, projectId }
        await this.projectAccess.assertEdit(context)
        await this.access.assertCanUseXpert(projectId, input.xpertId, actor)
        const target = await this.published.getAccessiblePublishedXpert(input.xpertId)
        if (
            target.id !== input.xpertId ||
            target.tenantId !== actor.tenantId ||
            (target.organizationId ?? null) !== (actor.organizationId ?? null) ||
            target.workspaceId !== input.workspaceId ||
            (target.version || target.id) !== input.publishedVersion
        )
            throw pipelineProjectionConflict('EXECUTOR_SCOPE_MISMATCH')
        await this.db.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            assertPipelineDispatchEnabled()
            const scope = projectionScope(context)
            const now = ((await manager.query('SELECT clock_timestamp() AS now')) as Array<{ now: Date }>)[0].now
            const { action, work } = await pipelineNativeGrantTarget(manager, this.actions, input)
            const id = pipelineIdentity(context, 'native-grant', action.id, source.callKey)
            const identity = {
                instanceId: action.instanceId,
                runId: work.run.id,
                roundId: work.round.id,
                nodeInstanceId: work.node.id,
                providerActionId: action.id,
                callKey: source.callKey,
                executionId: input.executionId,
                conversationId: input.conversationId,
                xpertId: input.xpertId,
                workspaceId: input.workspaceId,
                publishedVersion: input.publishedVersion,
                inputDigest: input.inputDigest,
                leaseOwner: source.leaseOwner,
                leaseFence: source.leaseFence
            }
            const existing = await manager.findOne(ProjectPipelineNativeGrantEntity, {
                withDeleted: true,
                where: { ...scope, id }
            })
            if (existing) {
                if (existing.deletedAt) throw pipelineProjectionConflict('NATIVE_DISPATCH_GRANT_CLOSED')
                const previous = {
                    instanceId: existing.instanceId,
                    runId: existing.runId,
                    roundId: existing.roundId,
                    nodeInstanceId: existing.nodeInstanceId,
                    providerActionId: existing.providerActionId,
                    callKey: existing.callKey,
                    executionId: existing.executionId,
                    conversationId: existing.conversationId,
                    xpertId: existing.xpertId,
                    workspaceId: existing.workspaceId,
                    publishedVersion: existing.publishedVersion,
                    inputDigest: existing.inputDigest,
                    leaseOwner: existing.leaseOwner,
                    leaseFence: existing.leaseFence
                }
                if (existing.createdById !== actor.userId || pipelineDigest(previous) !== pipelineDigest(identity))
                    throw pipelineProjectionConflict('NATIVE_GRANT_IDENTITY_IMMUTABLE')
                if (dispatch) {
                    if (existing.consumedAt) throw pipelineProjectionConflict('NATIVE_DISPATCH_ALREADY_CONSUMED')
                    if (
                        await manager.exists(XpertAgentExecution, {
                            withDeleted: true,
                            where: { id: input.executionId }
                        })
                    )
                        throw pipelineProjectionConflict('NATIVE_EXECUTION_ALREADY_EXISTS')
                    existing.consumedAt = now
                    await manager.save(existing)
                }
                return
            }
            if (
                action.state !== 'dispatching' ||
                action.leaseOwner !== source.leaseOwner ||
                action.leaseFence !== source.leaseFence ||
                !action.leaseExpiresAt ||
                action.leaseExpiresAt <= now
            )
                throw pipelineProjectionConflict('OPERATION_DISPATCH_NOT_AUTHORIZED')
            if (await manager.exists(XpertAgentExecution, { withDeleted: true, where: { id: input.executionId } }))
                throw pipelineProjectionConflict('NATIVE_EXECUTION_ALREADY_EXISTS')
            await manager.insert(ProjectPipelineNativeGrantEntity, {
                id,
                ...managedAudit(context),
                ...identity,
                consumedAt: dispatch ? now : null
            })
        })
    }
}

@CommandHandler(AuthorizePipelineNativeExecutionCommand)
export class AuthorizePipelineNativeExecutionHandler implements ICommandHandler<AuthorizePipelineNativeExecutionCommand> {
    constructor(private readonly grants: ProjectPipelineNativeGrantStore) {}
    execute(command: AuthorizePipelineNativeExecutionCommand) {
        return this.grants.consume(command.input)
    }
}
@CommandHandler(PreparePipelineNativeExecutionCommand)
export class PreparePipelineNativeExecutionHandler implements ICommandHandler<PreparePipelineNativeExecutionCommand> {
    constructor(private readonly grants: ProjectPipelineNativeGrantStore) {}
    execute(command: PreparePipelineNativeExecutionCommand) {
        return this.grants.prepare(command.input)
    }
}
