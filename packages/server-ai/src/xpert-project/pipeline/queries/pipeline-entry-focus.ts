// Read only after Project authorization. A node ID cannot select a historical or foreign business object.
import { NotFoundException } from '@nestjs/common'
import { t } from 'i18next'
import type { EntityManager } from 'typeorm'
import { projectPipelineProjectionNodeSchema } from '@xpert-ai/contracts'
import type { ProjectPipelineContext, ProjectTypePipelineNode } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineNodeEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineInstanceEntity
} from '../persistence/pipeline.entity'

export async function pipelineEntryFocus(
    manager: EntityManager,
    context: ProjectPipelineContext,
    nodeId: string
): Promise<ProjectTypePipelineNode> {
    const scope = projectionScope(context)
    const missing = () => new NotFoundException(t('server-ai:Error.ProjectPipelineNotFound'))
    return manager.transaction('REPEATABLE READ', async (reader) => {
        const node = await reader.findOneBy(ProjectPipelineNodeEntity, { ...scope, id: nodeId, disposition: 'active' })
        if (!node) throw missing()
        const round = await reader.findOneBy(ProjectPipelineRoundEntity, { ...scope, id: node.roundId })
        const run = round && (await reader.findOneBy(ProjectPipelineRunEntity, { ...scope, id: round.runId }))
        const instance =
            run &&
            (await reader.findOneBy(ProjectPipelineInstanceEntity, {
                ...scope,
                id: run.instanceId,
                currentRunId: run.id,
                currentRoundId: round.id
            }))
        const projection = projectPipelineProjectionNodeSchema.parse(node.projection)
        if (
            !instance ||
            projection.navigation?.kind !== 'project_application' ||
            projection.state.freshness !== 'current' ||
            projection.state.applicability !== 'selected'
        )
            throw missing()
        return {
            instanceId: instance.id,
            returnFocus: { instanceId: instance.id, roundId: round.id, nodeId: node.id },
            ownerRef: instance.ownerRef,
            sourceKey: instance.sourceKey,
            node: projection
        }
    })
}
