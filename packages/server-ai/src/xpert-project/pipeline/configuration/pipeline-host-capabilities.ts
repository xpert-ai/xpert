// Invariants: advertise only implemented protocols. No package-version inference or client overrides.
// This describes this process, not cluster readiness; incompatible binaries must be drained separately.
import {
    checkProjectPipelineHostCompatibility,
    projectPipelineDefinitionSchema,
    projectPipelineBindingSchema,
    type ProjectPipelineBinding,
    type ProjectPipelineDefinition
} from '@xpert-ai/contracts'
import type { EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineDefinitionEntity, ProjectPipelineRunEntity } from '../persistence/pipeline.entity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { pipelineHostCapabilities } from './pipeline-host-profile'
export { pipelineHostCapabilities } from './pipeline-host-profile'

export function assertPipelineHostCompatible(
    definition: ProjectPipelineDefinition,
    binding?: ProjectPipelineBinding | null
) {
    if (checkProjectPipelineHostCompatibility(definition, binding, pipelineHostCapabilities()).length)
        throw pipelineProjectionConflict('PIPELINE_HOST_INCOMPATIBLE')
}

/** Read the fixed run, including historical runs. Never compare against a newly published template. */
export async function pipelineRunHostCompatible(
    manager: EntityManager,
    context: ProjectPipelineContext,
    runId: string
) {
    const scope = projectionScope(context)
    const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: runId })
    const row = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, { ...scope, id: run.definitionId })
    const definition = projectPipelineDefinitionSchema.parse(row.definition)
    const binding = run.bindingSnapshot ? projectPipelineBindingSchema.parse(run.bindingSnapshot) : null
    return checkProjectPipelineHostCompatibility(definition, binding, pipelineHostCapabilities()).length === 0
}
