import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import {
    ProjectPipelineContributionRegistry,
    ProjectPipelineRuntimeAdapterRegistry,
    RequestContext,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import {
    SecretTokenBindingType,
    UserType,
    projectPipelineCompletionReceiptSchema,
    projectPipelineOperationReceiptSchema,
    type ProjectPipelineOperationAction,
    type ProjectPipelineOperationActions
} from '@xpert-ai/contracts'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import type { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineEvidenceService } from '../runtime/pipeline-evidence.service'
import { ProjectPipelineAssistantBridgeService } from '../runtime/pipeline-assistant-bridge.service'
import { pipelineAssistantIntentSchema } from '../runtime/pipeline-assistant-intent.schema'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { ProjectPipelineRecoveryStore } from './pipeline-recovery.store'
import { recoveryKeys, recoveryVersion } from './pipeline-recovery-record'

const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

/** Host-only availability; presentation text must not determine whether recovery needs attention. */
export interface PipelineRecoveryActions extends ProjectPipelineOperationActions {
    recoveryState: /** No recovery action is currently permitted. */
        | 'unavailable'
        /** At least one recovery action is currently permitted. */
        | 'available'
        /** An authorized recovery check holds the current lease. */
        | 'checking'
}

@Injectable()
export class ProjectPipelineRecoveryService {
    constructor(
        private readonly store: ProjectPipelineRecoveryStore,
        private readonly access: ProjectAccessRuntimeService,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry,
        private readonly catalog: ProjectPipelineContributionRegistry,
        private readonly evidence: ProjectPipelineEvidenceService,
        private readonly assistants: ProjectPipelineAssistantBridgeService,
        private readonly commands: CommandBus
    ) {}

    handles(key: string) {
        return recoveryKeys.some((value) => value === key)
    }

    private async authorize(c: ProjectPipelineContext) {
        const principal = RequestContext.currentApiPrincipal()
        const interactive =
            !principal ||
            (principal.principalType === 'client_secret' &&
                principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT &&
                principal.resourceScope?.kind === 'assistant')
        if (
            !interactive ||
            RequestContext.currentUser()?.type !== UserType.USER ||
            RequestContext.currentUserId() !== c.actor.userId ||
            RequestContext.currentTenantId() !== c.actor.tenantId ||
            (RequestContext.getOrganizationId() ?? null) !== (c.actor.organizationId ?? null)
        )
            throw new ForbiddenException()
        if ((await this.access.assertManage(c)).role === 'assistant') throw new ForbiddenException()
    }

    async describe(
        c: ProjectPipelineContext,
        operation: ProjectPipelineOperationEntity
    ): Promise<PipelineRecoveryActions> {
        const result: PipelineRecoveryActions = {
            operationId: operation.id,
            messages: [],
            items: [],
            recoveryState: 'unavailable'
        }
        if (operation.state !== 'failed') return result
        try {
            await this.authorize(c)
            const row = await this.store.operation(c, operation.id)
            const { run, spec } = await this.store.current(c, row)
            result.messages.push(
                label(
                    'This node failed. Recovery preserves completed upstream work and the failure history.',
                    '此节点执行失败。手动恢复会保留已完成的上游工作和失败历史。'
                )
            )
            if (row.leaseExpiresAt && row.leaseExpiresAt.getTime() > Date.now()) {
                result.recoveryState = 'checking'
                result.messages.push(label('A recovery check is in progress.', '正在核验恢复结果，请稍候。'))
                return result
            }
            const executor = run.bindingSnapshot.executorBindings?.[spec.executorSlot]
            if (
                executor?.kind === 'assistant' &&
                row.assistantIntent &&
                this.adapters.resolve('assistant_operation', row.handlerRef, c.actor).reconcile
            ) {
                result.items.push({
                    key: 'reconcile-result',
                    version: recoveryVersion(row),
                    title: label('Recover completed result', '核验已有结果并继续'),
                    confirmation: label(
                        'Revalidate existing evidence and advance only if completion is proven. This does not start another execution.',
                        '确认重新核验已有交付证据，仅在完成条件满足时推进流程。此操作不会启动新的执行。'
                    )
                })
            }
            if (row.attempt < 20 && this.retrySupported(c, row))
                result.items.push({
                    key: 'retry-once',
                    version: recoveryVersion(row),
                    title: label('Authorize one retry', '授权再试一次'),
                    confirmation: label(
                        'Authorize one new execution of this node, including its declared side effects and model costs. Existing completion must be checked first.',
                        '确认授权此节点再执行一次，包括该节点声明的副作用和模型费用。应先核验是否已有完成结果。'
                    )
                })
            if (result.items.length) result.recoveryState = 'available'
        } catch (error) {
            if (!(error instanceof ForbiddenException || error instanceof ConflictException)) throw error
        }
        return result
    }

    private retrySupported(c: ProjectPipelineContext, row: ProjectPipelineOperationEntity) {
        return this.catalog
            .listForActor(c.actor)
            .some((entry) =>
                entry.descriptors.some(
                    (item) =>
                        item.kind === 'operation' &&
                        item.ref === row.handlerRef &&
                        item.retry === 'after_confirmed_failure'
                )
            )
    }

    async submit(
        c: ProjectPipelineContext,
        operation: ProjectPipelineOperationEntity,
        input: ProjectPipelineOperationAction
    ) {
        await this.authorize(c)
        const mode = recoveryKeys.find((key) => key === input.key)
        if (!mode || operation.id !== input.operationId) throw pipelineProjectionConflict('RECOVERY_STATE_CONFLICT')
        if (mode === 'retry-once' && (operation.attempt >= 20 || !this.retrySupported(c, operation)))
            throw pipelineProjectionConflict('OPERATION_RETRY_UNSAFE')
        const claim = await this.store.request(c, input, mode, () => this.authorize(c))
        if (!claim) return
        try {
            const intent = pipelineAssistantIntentSchema.parse(claim.assistantIntent)
            const actor = { ...claim.context.actor, userId: intent.userId ?? claim.context.actor.userId }
            const identity = await this.commands.execute(
                new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' })
            )
            const outcome = await runWithExecutionIdentity(identity, async () => {
                const context = {
                    ...claim.context,
                    actor,
                    executor: {
                        userId: intent.userId,
                        xpertId: intent.xpertId,
                        workspaceId: intent.workspaceId,
                        publishedVersion: intent.publishedVersion,
                        executionId: intent.executionId,
                        conversationId: intent.conversationId
                    }
                }
                await this.access.assertEdit(context)
                const target = await this.assistants.resolve(context, intent.xpertId)
                if (target.workspaceId !== intent.workspaceId || target.publishedVersion !== intent.publishedVersion)
                    throw pipelineProjectionConflict('EXECUTOR_VERSION_CHANGED')
                const current = async () => {
                    await this.access.assertEdit(context)
                    for (const subject of context.subjects)
                        if (
                            !(await this.adapters
                                .resolve('subject', subject.resolverRef, actor)
                                .checkCurrent(context, subject))
                        )
                            throw pipelineProjectionConflict('SUBJECT_SUPERSEDED')
                    await this.evidence.inputs(context)
                }
                await current()
                const adapter = this.adapters.resolve('assistant_operation', claim.handlerRef, actor)
                if (!adapter.reconcile) throw pipelineProjectionConflict('RECOVERY_UNSUPPORTED')
                const outputs = await adapter.reconcile(context)
                if (!outputs) throw pipelineProjectionConflict('RECOVERY_RESULT_NOT_READY')
                const receipt = projectPipelineOperationReceiptSchema.parse({
                    status: 'succeeded',
                    receiptKey: claim.id,
                    execution: claim.receipt?.execution,
                    control: claim.receipt?.control,
                    outputs
                })
                const { spec } = await this.store.current(c, claim)
                await this.evidence.outputs(context, spec, receipt)
                const completion = projectPipelineCompletionReceiptSchema.parse(
                    await this.adapters.resolve('completion', claim.completionRef, actor).evaluate(context, receipt)
                )
                if (completion.status !== 'accepted') throw pipelineProjectionConflict('RECOVERY_RESULT_NOT_READY')
                for (const reference of completion.evidence) await this.evidence.verify(context, reference)
                await current()
                return { receipt, completion }
            })
            await this.store.complete(c, claim, outcome.receipt, outcome.completion, () => this.authorize(c))
        } finally {
            await this.store.release(c, claim)
        }
    }
}
