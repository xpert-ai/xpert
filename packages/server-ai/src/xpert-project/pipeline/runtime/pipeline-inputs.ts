import { EntityManager } from 'typeorm'
import type {
    ProjectPipelineNodeDefinition,
    ProjectPipelineOperationInput,
    ProjectPipelineBinding
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineDecisionEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { pipelineDecisionEvidence } from './pipeline-decision-evidence'

export async function pipelineInputs(
    manager: EntityManager,
    context: ProjectPipelineContext,
    round: ProjectPipelineRoundEntity,
    node: ProjectPipelineNodeDefinition,
    binding: ProjectPipelineBinding
): Promise<Record<string, ProjectPipelineOperationInput>> {
    const scope = projectionScope(context),
        inputs: Record<string, ProjectPipelineOperationInput> = {}
    const read = async (nodeKey: string, port: string) => {
        const producer = await manager.findOneByOrFail(ProjectPipelineNodeEntity, {
            ...scope,
            roundId: round.id,
            nodeKey,
            expansionKey: 'root'
        })
        if (
            producer.projection.state.lifecycle !== 'completed' ||
            producer.projection.state.applicability !== 'selected'
        )
            throw pipelineProjectionConflict('DEPENDENCY_PENDING')
        if (producer.projection.kind === 'human_gate' || producer.projection.kind === 'router') {
            const decision = await manager.findOneByOrFail(ProjectPipelineDecisionEntity, {
                ...scope,
                nodeInstanceId: producer.id,
                generation: round.generation,
                inputDigest: round.inputDigest
            })
            const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: round.runId })
            const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
                ...scope,
                id: run.definitionId
            })
            const reference = pipelineDecisionEvidence(decision)
            if (
                definition.definition.executionAuthority !== 'platform' ||
                definition.definition.nodes.find((item) => item.key === nodeKey)?.outputPorts?.[port] !==
                    reference.schemaRef
            )
                throw pipelineProjectionConflict('DECISION_OUTPUT_SCHEMA_MISMATCH')
            return reference
        }
        const operation = await manager.findOne(ProjectPipelineOperationEntity, {
            where: { ...scope, nodeInstanceId: producer.id, state: 'accepted' },
            order: { attempt: 'DESC' }
        })
        if (operation?.receipt?.status !== 'succeeded' || !operation.receipt.outputs[port])
            throw pipelineProjectionConflict('EVIDENCE_NOT_FOUND')
        return operation.receipt.outputs[port]
    }
    for (const [port, input] of Object.entries(node.inputBindings ?? {})) {
        inputs[port] =
            input.from === 'subject'
                ? { kind: 'subjects', value: round.subjectVersionSet }
                : input.from === 'parameter'
                  ? { kind: 'parameter', value: binding.parameters[input.key] }
                  : input.from === 'node_output'
                    ? { kind: 'evidence', value: await read(input.nodeKey, input.port) }
                    : {
                          kind: 'evidence_collection',
                          value: await Promise.all(input.items.map((item) => read(item.nodeKey, item.port)))
                      }
    }
    return inputs
}
