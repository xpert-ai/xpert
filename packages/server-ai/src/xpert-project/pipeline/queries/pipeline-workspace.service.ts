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
    ProjectPipelineRoundEntity
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

    async entry(
        context: ProjectPipelineContext,
        input: { instanceId?: string; pipelineNodeId?: string; xpertId?: string }
    ): Promise<XpertProjectEntry> {
        if (!input.instanceId) return this.projectTypes.entryForProject(context.projectId, input)
        await this.access.assertCanRead(context.projectId)
        const scope = projectionScope(context)
        const instance = await this.instances.findOneBy({ ...scope, id: input.instanceId })
        const missing = () => new NotFoundException(t('server-ai:Error.ProjectApplicationEntryUnavailable'))
        if (!instance) throw missing()
        if (instance.authority === 'provider') return this.projectTypes.entryForProject(context.projectId, input)
        const manager = this.instances.manager
        const [saved, round] = await Promise.all([
            manager.findOneBy(ProjectPipelineDefinitionEntity, { ...scope, id: instance.definitionId }),
            instance.currentRoundId &&
                manager.findOneBy(ProjectPipelineRoundEntity, {
                    ...scope,
                    id: instance.currentRoundId,
                    runId: instance.currentRunId
                })
        ])
        if (!saved || !round) throw missing()
        const definition = projectPipelineDefinitionSchema.parse(saved.definition)
        if (definition.executionAuthority !== 'platform') throw missing()
        const subjects = z.array(projectPipelineSubjectVersionSchema).parse(round.subjectVersionSet)
        if (subjects.length !== 1 || subjects[0].resolverRef !== definition.subjectResolverRef) throw missing()
        const adapter = this.adapters.resolve('subject', definition.subjectResolverRef, context.actor)
        if (!adapter.resolveEntry) throw missing()
        const entry = entrySchema.parse(await adapter.resolveEntry(context, subjects[0].objectKey))
        if (input.xpertId && entry.xpertId !== input.xpertId) throw missing()
        const assistant = await this.xperts.getAccessiblePublishedXpert(entry.xpertId)
        if ((assistant.organizationId ?? null) !== (context.actor.organizationId ?? null)) throw missing()
        await this.access.assertCanUseXpert(context.projectId, assistant.id)
        return {
            kind: 'assistant',
            slug: assistant.slug,
            projectId: context.projectId,
            ...entry,
            xpertId: assistant.id,
            viewKey: entry.viewKey!
        }
    }
}
