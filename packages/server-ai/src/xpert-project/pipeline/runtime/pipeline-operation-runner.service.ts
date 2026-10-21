// Invariants: durable operations and leases fence dispatch; external effects stay outside SQL transactions.
// An uncertain result must be observed before retrying, rather than treated as a confirmed failure.
import { ProjectPipelineRuntimeBridgeService } from './pipeline-runtime-bridge.service'
import { HttpException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { ProjectPipelineRuntimeAdapterRegistry, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import {
    projectPipelineDefinitionSchema,
    projectPipelineOperationReceiptSchema,
    projectPipelineCompletionReceiptSchema,
    projectPipelinePolicyReceiptSchema,
    type ProjectPipelineOperationReceipt,
    type ProjectPipelineCompletionReceipt,
    type ProjectPipelinePolicyReceipt
} from '@xpert-ai/contracts'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineDefinitionEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { ProjectPipelineOperationStore } from './pipeline-operation.store'
import { ProjectPipelineEvidenceService } from './pipeline-evidence.service'
import { ProjectPipelineOperationObserverService } from './pipeline-operation-observer.service'
import { ProjectPipelineAssistantBridgeService } from './pipeline-assistant-bridge.service'

/** External calls happen after a durable claim and outside every database transaction.
 * Recovery inspects the original idempotency key; it never repeats an ambiguous execute. */
@Injectable()
export class ProjectPipelineOperationRunnerService {
    private readonly logger = new Logger(ProjectPipelineOperationRunnerService.name)
    constructor(
        @InjectRepository(ProjectPipelineOperationEntity)
        private readonly operations: Repository<ProjectPipelineOperationEntity>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly store: ProjectPipelineOperationStore,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry,
        private readonly evidence: ProjectPipelineEvidenceService,
        private readonly observer: ProjectPipelineOperationObserverService,
        private readonly assistants: ProjectPipelineAssistantBridgeService,
        private readonly runtimes: ProjectPipelineRuntimeBridgeService
    ) {}

    async run(context: ProjectPipelineContext, operationId: string) {
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        const preparation = await this.store.resourcePreparation(context, operationId)
        if (preparation) {
            const claims = await this.adapters
                .resolve('resource', preparation.resolverRef, context.actor)
                .resolve(preparation.context)
            await this.store.prepareResources(context, operationId, { resolverRef: preparation.resolverRef, claims })
        }
        const workerId = randomUUID()
        const claim = await this.store.claim(context, operationId, workerId, 120_000)
        if (!claim) return
        const operation = claim.operation,
            scope = projectionScope(context)
        const run = await this.operations.manager.findOneByOrFail(ProjectPipelineRunEntity, {
            ...scope,
            id: operation.runId
        })
        const definition = await this.operations.manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
            ...scope,
            id: run.definitionId
        })
        const template = projectPipelineDefinitionSchema.parse(definition.definition)
        const node = await this.operations.manager.findOneByOrFail(ProjectPipelineNodeEntity, {
            ...scope,
            id: operation.nodeInstanceId
        })
        if (template.executionAuthority !== 'platform') throw new Error('PLATFORM_AUTHORITY_REQUIRED')
        const spec = template.nodes.find((item) => item.key === node.nodeKey)!
        const saved = operation.resourceReservation
            ? { ...operation.context, resources: operation.resourceReservation }
            : operation.context
        let receipt: ProjectPipelineOperationReceipt =
            operation.receipt?.status === 'succeeded' ? operation.receipt : { status: 'unknown' }
        let completion: ProjectPipelineCompletionReceipt | undefined
        let policy: ProjectPipelinePolicyReceipt | undefined
        try {
            if (claim.mode === 'cancel') {
                const executor =
                    spec.kind === 'work' ? run.bindingSnapshot.executorBindings?.[spec.executorSlot] : undefined
                if (executor?.kind === 'assistant')
                    receipt = await this.assistants.cancel(context, claim, workerId, executor.selectionKey)
                else if (executor?.kind === 'runtime_binding')
                    receipt = await this.runtimes.cancel(context, claim, workerId, executor.selectionKey)
                else if (await this.store.beginCancel(context, operation.id, workerId, claim.fence)) {
                    if (operation.kind === 'policy') receipt = { status: 'cancelled', receiptKey: operation.id }
                    else {
                        const handler = this.adapters.resolve(operation.kind, operation.handlerRef, context.actor)
                        receipt = projectPipelineOperationReceiptSchema.parse(
                            handler.cancel
                                ? await handler.cancel(saved, operation.receipt?.receiptKey ?? operation.id)
                                : await handler.inspect(saved, operation.receipt?.receiptKey)
                        )
                    }
                }
            } else {
                // No stale input is sent to an executor. Late effects remain observable through inspect.
                const current = async () => {
                    for (const subject of saved.subjects)
                        if (
                            !(await this.adapters
                                .resolve('subject', subject.resolverRef, context.actor)
                                .checkCurrent(context, subject))
                        )
                            return false
                    return true
                }
                const subjectsCurrent = await current()
                if (claim.mode === 'execute' && !subjectsCurrent) throw new Error('SUBJECT_SUPERSEDED')
                if (subjectsCurrent) await this.evidence.inputs(saved)
                const executor =
                    spec.kind === 'work' ? run.bindingSnapshot.executorBindings?.[spec.executorSlot] : undefined
                if (
                    claim.mode === 'execute' &&
                    executor?.kind !== 'assistant' &&
                    executor?.kind !== 'runtime_binding' &&
                    !(await this.store.beginDispatch(context, operation.id, workerId, claim.fence))
                )
                    return
                if (operation.kind === 'policy') {
                    if (!subjectsCurrent) throw new Error('SUBJECT_SUPERSEDED')
                    policy = projectPipelinePolicyReceiptSchema.parse(
                        await this.adapters.resolve('policy', operation.handlerRef, context.actor).evaluate(saved)
                    )
                    if (policy.status === 'decided') {
                        if (spec.kind !== 'router' || !spec.outcomes.includes(policy.outcome))
                            throw new Error('POLICY_OUTCOME_INVALID')
                        for (const ref of policy.evidence) await this.evidence.verify(saved, ref)
                        if (!(await current())) throw new Error('SUBJECT_SUPERSEDED')
                        receipt = { status: 'succeeded', receiptKey: operation.id, outputs: {} }
                        completion = { status: 'accepted', evidence: policy.evidence }
                    } else receipt = { status: 'failed', receiptKey: operation.id, code: policy.code }
                } else {
                    if (claim.mode === 'evaluate') receipt = operation.receipt!
                    else if (executor?.kind === 'assistant')
                        receipt = projectPipelineOperationReceiptSchema.parse(
                            await this.assistants.observe(context, claim, workerId, executor.selectionKey)
                        )
                    else if (executor?.kind === 'runtime_binding')
                        receipt = projectPipelineOperationReceiptSchema.parse(
                            await this.runtimes.observe(
                                context,
                                claim,
                                workerId,
                                executor.selectionKey,
                                executor.workspaceId
                            )
                        )
                    else {
                        const handler = this.adapters.resolve(operation.kind, operation.handlerRef, context.actor)
                        receipt = projectPipelineOperationReceiptSchema.parse(
                            claim.mode === 'execute'
                                ? await handler.execute(saved)
                                : await handler.inspect(saved, operation.receipt?.receiptKey)
                        )
                    }
                    if (receipt.status === 'succeeded') {
                        if (!subjectsCurrent || !(await current())) throw new Error('SUBJECT_SUPERSEDED')
                        await this.evidence.outputs(saved, spec, receipt)
                        completion =
                            operation.kind === 'subscription'
                                ? { status: 'accepted', evidence: Object.values(receipt.outputs) }
                                : projectPipelineCompletionReceiptSchema.parse(
                                      await this.adapters
                                          .resolve('completion', operation.completionRef!, context.actor)
                                          .evaluate(saved, receipt)
                                  )
                        if (completion.status === 'accepted')
                            for (const ref of completion.evidence) await this.evidence.verify(saved, ref)
                    }
                }
            }
        } catch (error) {
            const response = error instanceof HttpException ? error.getResponse() : null
            this.logger.warn(
                {
                    projectId: context.projectId,
                    operationId,
                    mode: claim.mode,
                    errorType: error instanceof Error ? error.name : 'UnknownError',
                    code: response && typeof response === 'object' && 'code' in response ? response.code : undefined
                },
                'Pipeline observation deferred'
            )
            policy = undefined
            // Runtime success is retained even if evidence access/evaluation is temporarily unavailable.
            completion =
                receipt.status === 'succeeded' ? { status: 'pending', code: 'EVALUATION_UNAVAILABLE' } : undefined
        }
        return this.store.settle(
            context,
            operation.id,
            workerId,
            claim.fence,
            { receipt, completion },
            (manager, observed) => this.observer.apply(manager, context, observed, policy),
            (manager, observed) => this.observer.historical(manager, context, observed)
        )
    }
}
