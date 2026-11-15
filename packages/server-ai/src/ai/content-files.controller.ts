import { AIPermissionsEnum } from '@xpert-ai/contracts'
import {
    ApiKeyOrClientSecretAuthGuard,
    Permissions,
    Public,
    UUIDValidationPipe,
    ZodValidationPipe
} from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { ContentEditorsService } from '../content-resource/content-editors.service'
import { AssistantFileAccess, AssistantFileAccessGuard } from './assistant-file-access.guard'

const schema = z
    .object({ path: z.string().min(1).max(2000), editorKey: z.string().min(1).max(200).optional() })
    .strict()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard, AssistantFileAccessGuard)
@AssistantFileAccess('workspace')
@Permissions(AIPermissionsEnum.CHAT_VIEW)
@Controller('assistants/:assistantId/projects/:projectId/content-files')
export class ContentFilesController {
    constructor(private readonly editors: ContentEditorsService) {}
    @Post('open')
    open(
        @Param('assistantId', UUIDValidationPipe) assistantId: string,
        @Param('projectId', UUIDValidationPipe) projectId: string,
        @Body(new ZodValidationPipe(schema, () => new BadRequestException('Invalid file reference')))
        body: { path: string; editorKey?: string }
    ) {
        return this.editors.resolveFile({
            ...body,
            assistantId,
            projectId,
            actor: {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                userId: RequestContext.currentUserId()
            }
        })
    }
}
