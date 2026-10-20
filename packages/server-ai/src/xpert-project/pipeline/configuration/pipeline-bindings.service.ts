import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
    projectPipelineSavedConfigurationSchema,
    projectPipelineCatalogProtocolSchema,
    canReadProjectPipelineConfiguration,
    projectPipelineCatalogRequestSchema,
    type ProjectPipelineCatalogRequest
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineBindingEntity, ProjectPipelineDefinitionEntity } from '../persistence/pipeline.entity'
import { MANAGED_PIPELINE_OWNER } from '../runtime/pipeline-managed-start.service'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

export const pipelineCatalogQuery = z
    .object({
        protocol: z
            .preprocess(
                (value) => (value === '1' ? 1 : value === '2' ? 2 : value),
                projectPipelineCatalogProtocolSchema
            )
            .optional()
    })
    .strict()
export const pipelineBindingsPageInput = pipelineCatalogQuery
    .extend({ after: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) })
    .strict()
@Injectable()
export class ProjectPipelineBindingsService {
    constructor(
        @InjectRepository(ProjectPipelineBindingEntity)
        private readonly repository: Repository<ProjectPipelineBindingEntity>,
        private readonly access: ProjectAccessRuntimeService
    ) {}
    private query(context: ProjectPipelineContext) {
        return this.repository
            .createQueryBuilder('binding')
            .where(projectionScope(context))
            .innerJoin(
                ProjectPipelineDefinitionEntity,
                'definition',
                'definition.id = binding."definitionId" AND definition."projectId" = binding."projectId" AND definition."ownerRef" = :owner',
                { owner: MANAGED_PIPELINE_OWNER }
            )
    }
    async get(context: ProjectPipelineContext, bindingId: string, request: ProjectPipelineCatalogRequest = {}) {
        await this.access.assertManage(context)
        const input = projectPipelineCatalogRequestSchema.parse(request)
        const row = await this.query(context)
            .andWhere('binding.id = :id', { id: z.string().uuid().parse(bindingId) })
            .getOne()
        if (!row) throw new NotFoundException()
        const saved = await this.serialize(context, row)
        if (!canReadProjectPipelineConfiguration(saved.configuration, input))
            throw pipelineProjectionConflict('PIPELINE_CLIENT_UPGRADE_REQUIRED')
        return saved
    }
    async list(
        context: ProjectPipelineContext,
        request: ProjectPipelineCatalogRequest & { after?: string; limit?: number } = {}
    ) {
        await this.access.assertManage(context)
        const input = pipelineBindingsPageInput.parse(request),
            query = this.query(context)
        if (input.protocol === undefined) query.andWhere("NOT (definition.definition ? 'hostRequirements')")
        if (input.protocol !== 2) query.andWhere("binding.configuration #> '{limits,nativeModelBudget}' IS NULL")
        if (input.after) {
            const cursor = await this.query(context).andWhere('binding.id = :id', { id: input.after }).getOne()
            if (!cursor) throw new NotFoundException()
            const timestamp =
                '(SELECT MAX(cursor."createdAt") FROM xpert_project_pipeline_binding cursor WHERE cursor.id = :after)'
            query.andWhere(
                `(binding."createdAt" < ${timestamp} OR (binding."createdAt" = ${timestamp} AND binding.id < :after))`,
                { after: cursor.id }
            )
        }
        const rows = await query
            .orderBy('binding.createdAt', 'DESC')
            .addOrderBy('binding.id', 'DESC')
            .take(input.limit + 1)
            .getMany()
        const page = rows.slice(0, input.limit)
        return {
            items: await Promise.all(page.map((row) => this.serialize(context, row))),
            next: rows.length > input.limit ? page.at(-1)!.id : null
        }
    }
    private async serialize(context: ProjectPipelineContext, row: ProjectPipelineBindingEntity) {
        const definition = await this.repository.manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
            ...projectionScope(context),
            id: row.definitionId,
            ownerRef: MANAGED_PIPELINE_OWNER
        })
        return projectPipelineSavedConfigurationSchema.parse({
            id: row.id,
            revision: row.revision,
            createdAt: row.createdAt.toISOString(),
            configuration: { schemaVersion: 1, template: definition.definition, binding: row.configuration }
        })
    }
}
