import { Permissions } from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { ProjectPermission, XpertProjectGuard } from '../../guards'
import { pipelineRefreshSchema } from '../projection/pipeline-projection.service'
import { ProjectPipelineQueryService } from './pipeline-query.service'
import { ProjectPipelineWorkspaceService } from './pipeline-workspace.service'
import { QueryBus } from '@nestjs/cqrs'
import { ProjectPipelineWorkbenchQuery } from './pipeline-workbench-navigation.query'
import { pipelineWorkbenchFocusSchema, type PipelineWorkbenchFocus } from './pipeline-workbench-navigation.schema'

const nodeFocusSchema = z.object({ roundId: z.string().uuid(), pipelineNodeId: z.string().uuid() }).strict()
const listSchema = z
    .object({ after: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) })
    .strict()
const graphSchema = z.object({ roundId: z.string().uuid().optional() }).strict()
const invalid = () => new BadRequestException(t('server-ai:Error.ProjectPipelineConfigurationInvalid'))

@Controller()
@UseGuards(XpertProjectGuard)
@Permissions(AIPermissionsEnum.XPERT_PROJECT_VIEW)
export class ProjectPipelineController {
    constructor(
        private readonly pipelines: ProjectPipelineQueryService,
        private readonly workspaces: ProjectPipelineWorkspaceService,
        private readonly queryBus: QueryBus
    ) {}
    private context(projectId: string) {
        return {
            projectId,
            actor: {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                userId: RequestContext.currentUserId()
            }
        }
    }

    @Get(':id/pipelines')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    list(
        @Param('id') id: string,
        @Query(new ZodValidationPipe(listSchema, invalid)) query: z.output<typeof listSchema>
    ) {
        return this.pipelines.list(this.context(id), query)
    }

    @Get(':id/pipelines/workbench-navigation')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    workbenchNavigation(
        @Param('id') id: string,
        @Query(new ZodValidationPipe(pipelineWorkbenchFocusSchema, invalid)) focus: PipelineWorkbenchFocus
    ) {
        return this.queryBus.execute(new ProjectPipelineWorkbenchQuery(this.context(id), focus))
    }

    @Get(':id/pipelines/:instanceId/graph')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    graph(
        @Param('id') id: string,
        @Param('instanceId', new ZodValidationPipe(z.string().uuid(), invalid)) instanceId: string,
        @Query(new ZodValidationPipe(graphSchema, invalid)) query: z.output<typeof graphSchema>
    ) {
        return this.pipelines.graph(this.context(id), instanceId, query)
    }

    @Get(':id/pipelines/:instanceId/node-workbench')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    nodeWorkbench(
        @Param('id') id: string,
        @Param('instanceId', new ZodValidationPipe(z.string().uuid(), invalid)) instanceId: string,
        @Query(new ZodValidationPipe(nodeFocusSchema, invalid)) query: z.output<typeof nodeFocusSchema>
    ) {
        return this.workspaces.entry(this.context(id), { instanceId, ...query, requireNodeWorkbench: true })
    }

    @Get(':id/pipelines/:instanceId/rounds')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    rounds(
        @Param('id') id: string,
        @Param('instanceId', new ZodValidationPipe(z.string().uuid(), invalid)) instanceId: string,
        @Query(new ZodValidationPipe(listSchema, invalid)) query: z.output<typeof listSchema>
    ) {
        return this.pipelines.rounds(this.context(id), instanceId, query)
    }

    @Post(':id/pipelines/refresh')
    @HttpCode(202)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    refresh(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(pipelineRefreshSchema, invalid)) input: z.output<typeof pipelineRefreshSchema>
    ) {
        return this.pipelines.refresh(this.context(id), { providerRef: input.providerRef, sourceKey: input.sourceKey })
    }
}
