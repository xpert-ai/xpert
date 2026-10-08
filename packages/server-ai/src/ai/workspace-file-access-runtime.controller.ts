import { Body, Controller, Delete, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
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
import { AssistantFileAccess, AssistantFileAccessGuard } from './assistant-file-access.guard'

/** Runtime authorization lives under /api/ai; issued content URLs remain cookie-bound. */
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

    @Delete(':sessionId')
    @AssistantFileAccess('view-session')
    async revokeSession(@Param('sessionId') sessionId: string, @Res({ passthrough: true }) response: Response) {
        await this.service.revokeSession(sessionId)
        response.clearCookie('xpert_workspace_file_access', { path: this.service.buildCookiePath(sessionId) })
        return { success: true }
    }
}
