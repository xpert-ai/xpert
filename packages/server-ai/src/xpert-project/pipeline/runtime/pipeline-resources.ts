// Resource occupancy follows the external operation lifetime, not the worker lease.
// Unknown/deleted/superseded work stays occupied until confirmed terminal evidence.
import type { EntityManager } from 'typeorm'
import { projectPipelineConfigurationSchema, projectPipelineResourceReservationSchema } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineDefinitionEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

export async function pipelineResourceResolverRef(
    manager: EntityManager,
    context: ProjectPipelineContext,
    operation: ProjectPipelineOperationEntity
): Promise<string | undefined> {
    if (operation.kind !== 'operation') return undefined
    const scope = projectionScope(context)
    const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: operation.runId })
    const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
        ...scope,
        id: run.definitionId
    })
    const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, { ...scope, id: operation.nodeInstanceId })
    const config = projectPipelineConfigurationSchema.parse({
        schemaVersion: 1,
        template: definition.definition,
        binding: run.bindingSnapshot
    })
    if (config.template.executionAuthority !== 'platform')
        throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
    const spec = config.template.nodes.find((item) => item.key === node.nodeKey)
    return spec?.kind === 'work' ? spec.resourceResolverRef : undefined
}

/** Project lock must already be held; all physical keys are locked in canonical order. */
export async function pipelineResourcesBlock(
    manager: EntityManager,
    context: ProjectPipelineContext,
    operation: ProjectPipelineOperationEntity
): Promise<boolean> {
    if (!manager.queryRunner?.isTransactionActive) throw Error('PIPELINE_RESOURCES_REQUIRE_TRANSACTION')
    const expected = await pipelineResourceResolverRef(manager, context, operation)
    if (!expected) {
        if (operation.resourceReservation) throw pipelineProjectionConflict('RESOURCE_RESERVATION_UNEXPECTED')
        return false
    }
    if (!operation.resourceReservation) return true
    const reservation = projectPipelineResourceReservationSchema.parse(operation.resourceReservation)
    if (reservation.resolverRef !== expected) throw pipelineProjectionConflict('RESOURCE_RESOLVER_CHANGED')
    for (const claim of reservation.claims) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
            `xpert.pipeline.resource.v1:${claim.key}`
        ])
    }
    for (const claim of reservation.claims) {
        // Deliberately cross tenant: the same physical directory cannot be two independent locks.
        const collision = await manager
            .getRepository(ProjectPipelineOperationEntity)
            .createQueryBuilder('operation')
            .withDeleted()
            .where(
                'operation."resourceReservation" IS NOT NULL AND operation."leaseFence" > 0 AND operation."terminalObservedAt" IS NULL'
            )
            .andWhere('operation.id <> :id', { id: operation.id })
            .andWhere('operation."resourceReservation" @> CAST(:resource AS jsonb)', {
                resource: JSON.stringify({ claims: [{ key: claim.key }] })
            })
            .andWhere(
                `EXISTS (SELECT 1 FROM jsonb_array_elements(operation."resourceReservation"->'claims') held
                WHERE held->>'key' = :key AND (:exclusive OR held->>'mode' = 'exclusive'))`,
                { key: claim.key, exclusive: claim.mode === 'exclusive' }
            )
            .getExists()
        if (collision) return true
    }
    return false
}
