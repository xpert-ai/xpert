// Only the original version-bound provider action can authorize native dispatch.
import { projectPipelineProviderActionCommandSchema } from '@xpert-ai/contracts'
import type { EntityManager } from 'typeorm'
import { ProjectPipelineProviderActionEntity } from '../persistence/pipeline.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineProviderActionStore } from '../provider-actions/provider-action.store'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { assertPipelineHostCompatible } from '../configuration/pipeline-host-capabilities'
import type { PipelineNativeGrantRequest } from './pipeline-native-grant.command'
export async function pipelineNativeGrantTarget(
    manager: EntityManager,
    actions: ProjectPipelineProviderActionStore,
    input: PipelineNativeGrantRequest
) {
    const { actor, projectId, source } = input,
        context = { actor, projectId },
        scope = projectionScope(context)
    const action = await manager.findOneBy(ProjectPipelineProviderActionEntity, { ...scope, id: source.operationId })
    if (
        !action ||
        action.createdById !== actor.userId ||
        !action.dispatchStartedAt ||
        !['dispatching', 'pending', 'unknown', 'succeeded'].includes(action.state)
    )
        throw pipelineProjectionConflict('OPERATION_DISPATCH_NOT_AUTHORIZED')
    action.input = projectPipelineProviderActionCommandSchema.parse(action.input)
    const work = await actions.target(
        context,
        { instanceId: action.instanceId, nodeInstanceId: action.nodeInstanceId },
        manager
    )
    assertPipelineHostCompatible(work.definition)
    if (
        work.round.state !== 'active' ||
        work.instance.ownerRef !== action.providerRef ||
        work.instance.sourceKey !== action.sourceKey ||
        work.node.projection.state.freshness !== 'current' ||
        work.node.projection.state.applicability !== 'selected' ||
        !['active', 'pending', 'waiting'].includes(work.run.state) ||
        work.run.id !== action.runId ||
        work.round.id !== action.roundId ||
        work.round.generation !== action.input.generation ||
        work.round.inputDigest !== action.input.inputDigest
    )
        throw pipelineProjectionConflict('PROVIDER_ACTION_VERSION_CONFLICT')
    return { action, work }
}
