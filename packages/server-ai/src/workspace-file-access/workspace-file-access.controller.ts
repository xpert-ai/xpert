import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Req, Res, StreamableFile } from '@nestjs/common'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { t } from 'i18next'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { UseValidationPipe } from '@xpert-ai/server-core'
import type { Request, Response } from 'express'
import { CreateWorkspaceFileAccessSessionDto, CreateWorkspaceFileAccessGrantDto } from './workspace-file-access.dto'
import { WorkspaceFileAccessService } from './workspace-file-access.service'
import { buildWorkspaceFileContentDisposition } from './workspace-file-content.controller'

@ApiTags('WorkspaceFiles')
@ApiBearerAuth()
@Controller()
export class WorkspaceFileAccessController {
    constructor(private readonly service: WorkspaceFileAccessService) {}

    @Post('view-sessions')
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

    @Post('view-sessions/:sessionId/grants')
    @UseValidationPipe({ whitelist: true, transform: true })
    createGrant(@Param('sessionId') sessionId: string, @Body() body: CreateWorkspaceFileAccessGrantDto) {
        return this.service.createGrant(sessionId, body)
    }

    @Get('view-sessions/:sessionId/grants/:grantId/content/:fileName')
    async download(
        @Param('sessionId') sessionId: string,
        @Param('grantId') grantId: string,
        @Param('fileName') fileName: string,
        @Res({ passthrough: true }) response: Response
    ) {
        const authorization = await this.service.authorizeAuthenticatedDownload(sessionId, grantId, fileName)
        const { filePath } = this.service.resolveAuthorizedFile(authorization)
        const info = await stat(filePath).catch(() => null)
        if (!info?.isFile())
            throw new NotFoundException(
                t('server-ai:Error.WorkspaceFileAccessNotFound', { defaultValue: 'Workspace file was not found.' })
            )
        response.setHeader('Cache-Control', 'private, no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        return new StreamableFile(createReadStream(filePath), {
            type: authorization.grant.mimeType,
            disposition: buildWorkspaceFileContentDisposition('download', authorization.grant.fileName),
            length: info.size
        })
    }

    @Delete('view-sessions/:sessionId')
    async revokeSession(@Param('sessionId') sessionId: string, @Res({ passthrough: true }) response: Response) {
        await this.service.revokeSession(sessionId)
        response.clearCookie('xpert_workspace_file_access', { path: this.service.buildCookiePath(sessionId) })
        return { success: true }
    }
}
