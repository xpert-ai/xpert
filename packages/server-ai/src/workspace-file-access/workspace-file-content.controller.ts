import { Controller, Get, Head, NotFoundException, Req, Res, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '@xpert-ai/server-core'
import type { Response } from 'express'
import { t } from 'i18next'
import { WorkspaceFileAccessGuard, WorkspaceFileAccessRequest } from './workspace-file-access.guard'
import { WorkspaceFileAccessService } from './workspace-file-access.service'
import { sendWorkspaceFileContent } from './workspace-file-content.response'
export { buildWorkspaceFileContentDisposition } from './workspace-file-content.response'

// Content URLs use the granted file-session cookie, independently of ChatKit credentials.
@ApiTags('WorkspaceFiles')
@Public()
@UseGuards(WorkspaceFileAccessGuard)
@Controller('content')
export class WorkspaceFileContentController {
    constructor(private readonly service: WorkspaceFileAccessService) {}

    @Get(':sessionId/:grantId/:fileName')
    streamContent(@Req() request: WorkspaceFileAccessRequest, @Res() response: Response) {
        return this.sendContent(request, response, false)
    }

    @Head(':sessionId/:grantId/:fileName')
    headContent(@Req() request: WorkspaceFileAccessRequest, @Res() response: Response) {
        return this.sendContent(request, response, true)
    }

    private async sendContent(request: WorkspaceFileAccessRequest, response: Response, headOnly: boolean) {
        const authorization = request.workspaceFileAccess
        if (!authorization) {
            throw new NotFoundException(
                t('server-ai:Error.WorkspaceFileAccessNotFound', { defaultValue: 'Workspace file was not found.' })
            )
        }
        const origin = this.service.assertRequestOrigin(authorization.session, request, authorization.grant.purpose)
        const resolved = this.service.resolveAuthorizedFile(authorization)
        return sendWorkspaceFileContent(authorization, resolved.filePath, request, response, headOnly, origin)
    }
}
