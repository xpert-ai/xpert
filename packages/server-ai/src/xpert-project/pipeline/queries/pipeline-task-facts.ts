import { In, type EntityManager } from 'typeorm'
import { z } from 'zod/v3'
import {
    projectPipelineConfigurationSchema,
    projectPipelineOperationReceiptSchema,
    type IXpertProjectTaskExecution
} from '@xpert-ai/contracts'
import type { ProjectTaskContext } from '@xpert-ai/plugin-sdk'
import type { XpertProjectTask } from '../../entities/project-task.entity'
import type { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineDefinitionEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineTaskLinkEntity
} from '../persistence/pipeline.entity'

/** Read immutable run bindings and recorded service receipts, never infer execution from business completion. */
export async function pipelineTaskFacts(
    manager: EntityManager,
    context: ProjectTaskContext,
    tasks: readonly XpertProjectTask[],
    attempts: readonly XpertProjectTaskExecution[]
) {
    const assignees = new Map<string, string>()
    const kinds = new Map<string, 'initial' | 'technical_retry'>()
    const services = new Map<
        string,
        {
            runtimeProvider: string
            runtimeServiceRef: string
            runtimeStatus: IXpertProjectTaskExecution['runtimeStatus']
            runtimeStartedAt: string | null
            runtimeCompletedAt: string | null
        }
    >()
    const managed = tasks.filter((task) => task.controlKind === 'pipeline' && task.pipelineInstanceId)
    if (!managed.length) return { assignees, services, kinds }
    const scope = projectionScope(context)
    const links = await manager.find(ProjectPipelineTaskLinkEntity, {
        where: { ...scope, taskId: In(managed.map((task) => task.id)), relation: 'primary' }
    })
    if (!links.length) return { assignees, services, kinds }
    const nodes = await manager.find(ProjectPipelineNodeEntity, {
        where: { ...scope, id: In(links.map((link) => link.nodeInstanceId)) }
    })
    const rounds = await manager.find(ProjectPipelineRoundEntity, {
        where: { ...scope, id: In(nodes.map((node) => node.roundId)) }
    })
    const runs = await manager.find(ProjectPipelineRunEntity, {
        where: { ...scope, id: In(rounds.map((round) => round.runId)) }
    })
    const definitions = await manager.find(ProjectPipelineDefinitionEntity, {
        where: { ...scope, id: In(runs.map((run) => run.definitionId)) }
    })
    const configs = new Map(
        runs.map((run) => [
            run.id,
            projectPipelineConfigurationSchema.parse({
                schemaVersion: 1,
                template: definitions.find((definition) => definition.id === run.definitionId)?.definition,
                binding: run.bindingSnapshot
            })
        ])
    )
    const serviceNodes = new Map<string, string>()
    const managedNodes = new Map<string, string>()
    for (const task of managed) {
        const node = nodes.find((node) => node.id === links.find((link) => link.taskId === task.id)?.nodeInstanceId)
        const round = rounds.find((round) => round.id === node?.roundId)
        const run = runs.find((run) => run.id === round?.runId && run.instanceId === task.pipelineInstanceId)
        const config = run && configs.get(run.id)
        if (!node || config?.template.executionAuthority !== 'platform') continue
        const spec = config.template.nodes.find((spec) => spec.key === node.nodeKey)
        if (spec?.kind === 'work') managedNodes.set(task.id, node.id)
        const executor = spec?.kind === 'work' ? config.binding.executorBindings?.[spec.executorSlot] : undefined
        if (executor?.kind === 'assistant') assignees.set(task.id, z.string().uuid().parse(executor.selectionKey))
        if (executor?.kind === 'service') serviceNodes.set(task.id, node.id)
    }
    const managedAttempts = attempts.filter((attempt) => managedNodes.has(attempt.taskId) && attempt.sourceKey)
    if (!managedAttempts.length) return { assignees, services, kinds }
    const operations = await manager.find(ProjectPipelineOperationEntity, {
        where: { ...scope, id: In(managedAttempts.map((attempt) => attempt.sourceKey)) }
    })
    for (const attempt of managedAttempts) {
        const operation = operations.find(
            (operation) =>
                operation.id === attempt.sourceKey && operation.nodeInstanceId === managedNodes.get(attempt.taskId)
        )
        if (!operation || operation.kind !== 'operation') continue
        // The managed coordinator increments this ordinal only after an authorized technical retry.
        kinds.set(attempt.id, operation.attempt === 1 ? 'initial' : 'technical_retry')
        if (!serviceNodes.has(attempt.taskId) || attempt.agentExecutionId || attempt.invocationId) continue
        const receipt = operation.receipt ? projectPipelineOperationReceiptSchema.parse(operation.receipt) : null
        if (receipt?.execution) continue
        const terminal = receipt && ['succeeded', 'failed', 'cancelled'].includes(receipt.status)
        services.set(attempt.id, {
            runtimeProvider: 'pipeline-service',
            runtimeServiceRef: operation.handlerRef,
            runtimeStatus:
                receipt?.status === 'pending'
                    ? 'running'
                    : (receipt?.status ?? (operation.state === 'queued' ? 'queued' : 'unknown')),
            runtimeStartedAt: operation.dispatchStartedAt?.toISOString() ?? null,
            runtimeCompletedAt: terminal ? (operation.terminalObservedAt?.toISOString() ?? null) : null
        })
    }
    return { assignees, services, kinds }
}
