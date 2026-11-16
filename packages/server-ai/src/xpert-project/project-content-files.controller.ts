import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { Public, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { z } from 'zod'
import { ContentEditorsService } from '../content-resource/content-editors.service'
import { ProjectPermission, XpertProjectAuthGuard, XpertProjectGuard, XpertProjectPermissionGuard } from './guards'

@Public()
@UseGuards(XpertProjectAuthGuard, XpertProjectGuard, XpertProjectPermissionGuard)
@Controller(':id/content-files')
export class ProjectContentFilesController {
    constructor(private readonly editors: ContentEditorsService) {}
    @Post('open')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    open(
        @Param('id', UUIDValidationPipe) projectId: string,
        @Body(
            new ZodValidationPipe(
                z.object({ path: z.string().min(1).max(2000) }).strict(),
                () => new BadRequestException('Invalid file reference')
            )
        )
        body: { path: string }
    ) {
        return this.editors.resolveFile({
            path: body.path,
            projectId,
            actor: {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                userId: RequestContext.currentUserId()
            }
        })
    }
}
