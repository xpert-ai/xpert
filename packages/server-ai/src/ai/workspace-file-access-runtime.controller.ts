import { Body, Controller, Delete, Get, Head, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    UseValidationPipe
} from '@xpert-ai/server-core'
import type { Request, Response } from 'express'
import {
    CreateWorkspaceFileAccessGrantDto,
    CreateWorkspaceFileAccessSessionDto
} from '../workspace-file-access/workspace-file-access.dto'
import { WorkspaceFileAccessService } from '../workspace-file-access/workspace-file-access.service'
import { sendWorkspaceFileContent } from '../workspace-file-access/workspace-file-content.response'
import { AssistantFileAccess, AssistantFileAccessGuard } from './assistant-file-access.guard'

/** ChatKit authenticates content reads here; direct content URLs retain their cookie-bound policy. */
@ApiTags('WorkspaceFilesRuntime')
@ApiBearerAuth()
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard, AssistantFileAccessGuard)
@Controller('workspace-files/view-sessions')
export class WorkspaceFileAccessRuntimeController {
    constructor(private readonly service: WorkspaceFileAccessService) {}

    @Post()
    @AssistantFileAccess('view-session-create')
    @UseValidationPipe({ whitelist: true, transform: true })
    async createSession(
        @Body() body: CreateWorkspaceFileAccessSessionDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ) {
        const session = await this.service.createSession(body, request)
        response.cookie(session.cookie.name, session.cookie.value, session.cookie.options)
        return { sessionId: session.sessionId, expiresAt: session.expiresAt }
    }

    @Post(':sessionId/grants')
    @AssistantFileAccess('view-session')
    @UseValidationPipe({ whitelist: true, transform: true })
    createGrant(@Param('sessionId') sessionId: string, @Body() body: CreateWorkspaceFileAccessGrantDto) {
        return this.service.createGrant(sessionId, body)
    }

    @Get(':sessionId/grants/:grantId/content/:fileName')
    @AssistantFileAccess('view-session')
    async content(
        @Param('sessionId') sessionId: string,
        @Param('grantId') grantId: string,
        @Param('fileName') fileName: string,
        @Req() request: Request,
        @Res() response: Response
    ) {
        const authorization = await this.service.authorizeAuthenticatedContent(sessionId, grantId, fileName)
        const { filePath } = this.service.resolveAuthorizedFile(authorization)
        return sendWorkspaceFileContent(authorization, filePath, request, response, request.method === 'HEAD')
    }

    @Head(':sessionId/grants/:grantId/content/:fileName')
    @AssistantFileAccess('view-session')
    headContent(@Req() request: Request, @Res() response: Response) {
        return this.content(
            request.params.sessionId,
            request.params.grantId,
            request.params.fileName,
            request,
            response
        )
    }

    @Delete(':sessionId')
    @AssistantFileAccess('view-session')
    async revokeSession(@Param('sessionId') sessionId: string, @Res({ passthrough: true }) response: Response) {
        await this.service.revokeSession(sessionId)
        response.clearCookie('xpert_workspace_file_access', { path: this.service.buildCookiePath(sessionId) })
        return { success: true }
    }
}
