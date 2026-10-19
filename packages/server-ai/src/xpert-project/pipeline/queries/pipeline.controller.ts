import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { ProjectPermission, XpertProjectGuard } from '../../guards'
import { pipelineRefreshSchema } from '../projection/pipeline-projection.service'
import { ProjectPipelineQueryService } from './pipeline-query.service'

const listSchema = z
    .object({ after: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) })
    .strict()
const graphSchema = z.object({ roundId: z.string().uuid().optional() }).strict()
const invalid = () => new BadRequestException(t('server-ai:Error.ProjectPipelineConfigurationInvalid'))

@Controller()
@UseGuards(XpertProjectGuard)
export class ProjectPipelineController {
    constructor(private readonly pipelines: ProjectPipelineQueryService) {}
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

    @Get(':id/pipelines/:instanceId/graph')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    graph(
        @Param('id') id: string,
        @Param('instanceId', new ZodValidationPipe(z.string().uuid(), invalid)) instanceId: string,
        @Query(new ZodValidationPipe(graphSchema, invalid)) query: z.output<typeof graphSchema>
    ) {
        return this.pipelines.graph(this.context(id), instanceId, query)
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
