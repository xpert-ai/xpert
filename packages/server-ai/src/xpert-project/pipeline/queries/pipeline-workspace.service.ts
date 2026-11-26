import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { t } from 'i18next'
import {
    projectPipelineDefinitionSchema,
    projectPipelineSubjectVersionSchema,
    type XpertProjectEntry
} from '@xpert-ai/contracts'
import { ProjectPipelineRuntimeAdapterRegistry, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertProjectTypeService } from '../../services/project-type.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'

const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
const entrySchema = z
    .object({
        xpertId: z.string().min(1),
        viewKey: z.string().min(1),
        selectionId: z.string().optional(),
        parameters: z.record(z.union([scalar, z.array(scalar)])).optional()
    })
    .strict()

type WorkspaceFocus = {
    instanceId?: string
    roundId?: string
    pipelineNodeId?: string
    xpertId?: string
    requireNodeWorkbench?: boolean
}
type NodeNavigation = {
    kind: 'node-navigation'
    target: {
        target: 'project.application'
        projectId: string
        pipelineInstanceId: string
        pipelineRoundId: string
        pipelineNodeId: string
    }
}

/** Resolve saved subjects through their registered adapter, never infer a business view from template names. */
@Injectable()
export class ProjectPipelineWorkspaceService {
    constructor(
        @InjectRepository(ProjectPipelineInstanceEntity)
        private readonly instances: Repository<ProjectPipelineInstanceEntity>,
        private readonly projectTypes: XpertProjectTypeService,
        private readonly access: XpertProjectAccessService,
        private readonly xperts: PublishedXpertAccessService,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry
    ) {}

    async entry(context: ProjectPipelineContext, input: WorkspaceFocus): Promise<XpertProjectEntry>
    async entry(
        context: ProjectPipelineContext,
        input: WorkspaceFocus,
        phase: 'navigation'
    ): Promise<XpertProjectEntry | NodeNavigation>
    async entry(
        context: ProjectPipelineContext,
        input: WorkspaceFocus,
        phase?: 'navigation'
    ): Promise<XpertProjectEntry | NodeNavigation> {
        if (!input.instanceId) return this.projectTypes.entryForProject(context.projectId, input)
        await this.access.assertCanRead(context.projectId)
        const scope = projectionScope(context)
        const instance = await this.instances.findOneBy({ ...scope, id: input.instanceId })
        const missing = () => new NotFoundException(t('server-ai:Error.ProjectApplicationEntryUnavailable'))
        if (!instance) throw missing()
        if (instance.authority === 'provider' && !input.pipelineNodeId) {
            if (input.requireNodeWorkbench) throw missing()
            return this.projectTypes.entryForProject(context.projectId, input)
        }
        const manager = this.instances.manager
        const selectedRoundId = input.roundId ?? instance.currentRoundId
        const round =
            selectedRoundId && (await manager.findOneBy(ProjectPipelineRoundEntity, { ...scope, id: selectedRoundId }))
        if (!round) throw missing()
        const run = await manager.findOneBy(ProjectPipelineRunEntity, {
            ...scope,
            id: round.runId,
            instanceId: instance.id
        })
        if (!run) throw missing()
        const node = input.pipelineNodeId
            ? await manager.findOneBy(ProjectPipelineNodeEntity, {
                  ...scope,
                  id: input.pipelineNodeId,
                  roundId: selectedRoundId
              })
            : undefined
        if (input.pipelineNodeId && !node) throw missing()
        if (instance.authority === 'provider') {
            if (!node || instance.currentRoundId !== round.id || instance.currentRunId !== run.id) throw missing()
            const entry =
                phase === 'navigation' && input.xpertId
                    ? await this.projectTypes.entryForProject(context.projectId, input, input.xpertId)
                    : await this.projectTypes.entryForProject(context.projectId, input)
            if (entry.kind === 'other-assistant') {
                return this.nodeNavigation(context.projectId, instance.id, round.id, node.id, input.xpertId)
            }
            if (entry.kind !== 'assistant') throw missing()
            return entry
        }
        const saved = await manager.findOneBy(ProjectPipelineDefinitionEntity, { ...scope, id: run.definitionId })
        if (!saved) throw missing()
        const definition = projectPipelineDefinitionSchema.parse(saved.definition)
        if (definition.executionAuthority !== 'platform') throw missing()
        const subjects = z.array(projectPipelineSubjectVersionSchema).parse(round.subjectVersionSet)
        if (subjects.length !== 1 || subjects[0].resolverRef !== definition.subjectResolverRef) throw missing()
        const adapter = this.adapters.resolve('subject', definition.subjectResolverRef, context.actor)
        if (!adapter.resolveEntry) throw missing()
        const routeToExecutor =
            node &&
            adapter.nodeWorkbenches?.some(
                (item) =>
                    item.definitionKey === definition.key && item.version === definition.version && item.routeToExecutor
            )
        if (input.requireNodeWorkbench && !routeToExecutor) throw missing()
        let nodeTarget: { executorXpertId?: string } | undefined
        if (routeToExecutor) {
            const spec = definition.nodes.find((item) => item.key === node.nodeKey)
            if (!spec) throw missing()
            const executor =
                spec.kind === 'work' ? run.bindingSnapshot?.executorBindings?.[spec.executorSlot] : undefined
            if (spec.kind === 'work' && !executor) throw missing()
            nodeTarget = executor?.kind === 'assistant' ? { executorXpertId: executor.selectionKey } : {}
        }
        const objectKey = subjects[0].objectKey
        const entry = entrySchema.parse(
            nodeTarget
                ? await adapter.resolveEntry(context, objectKey, input.xpertId, nodeTarget)
                : await adapter.resolveEntry(context, objectKey, input.xpertId)
        )
        const expected = nodeTarget ? nodeTarget.executorXpertId : input.xpertId
        if (expected && entry.xpertId !== expected) throw missing()
        // An Assistant-scoped view credential authorizes its own host. Crossing hosts returns
        // only the saved focus. The Project route resolves the destination under the user's session.
        if (phase === 'navigation' && nodeTarget && node && input.xpertId !== entry.xpertId) {
            return this.nodeNavigation(context.projectId, instance.id, round.id, node.id, input.xpertId)
        }
        const assistant = await this.xperts.getAccessiblePublishedXpert(entry.xpertId)
        if ((assistant.organizationId ?? null) !== (context.actor.organizationId ?? null)) throw missing()
        await this.access.assertCanUseXpert(context.projectId, assistant.id)
        return {
            kind: 'assistant',
            slug: assistant.slug,
            projectId: context.projectId,
            ...entry,
            parameters: {
                ...entry.parameters,
                pipelineInstanceId: instance.id,
                pipelineRoundId: selectedRoundId,
                ...(input.pipelineNodeId ? { pipelineNodeId: input.pipelineNodeId } : {})
            },
            xpertId: assistant.id,
            viewKey: entry.viewKey!
        }
    }

    private async nodeNavigation(
        projectId: string,
        instanceId: string,
        roundId: string,
        nodeId: string,
        sourceAssistant?: string
    ): Promise<NodeNavigation> {
        if (sourceAssistant) await this.access.assertCanUseXpert(projectId, sourceAssistant)
        return {
            kind: 'node-navigation',
            target: {
                target: 'project.application',
                projectId,
                pipelineInstanceId: instanceId,
                pipelineRoundId: roundId,
                pipelineNodeId: nodeId
            }
        }
    }
}
