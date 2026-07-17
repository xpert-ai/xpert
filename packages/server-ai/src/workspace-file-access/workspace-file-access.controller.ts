import {
    Body,
    Controller,
    Delete,
    Get,
    Head,
    Logger,
    NotFoundException,
    Param,
    Post,
    Req,
    Res,
    UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
import type { Request, Response } from 'express'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { t } from 'i18next'
import type { XpertViewFileAccessPurpose } from '@xpert-ai/contracts'
import { Public } from '@xpert-ai/server-core'
import { UseValidationPipe } from '@xpert-ai/server-core'
import { getMediaTypeWithCharset, resolveHttpByteRange } from '../shared'
import { WorkspaceFileAccessGuard, WorkspaceFileAccessRequest } from './workspace-file-access.guard'
import { WorkspaceFileAccessService } from './workspace-file-access.service'

class CreateWorkspaceFileAccessSessionDto {
    @IsString()
    hostType!: string

    @IsString()
    hostId!: string

    @IsString()
    viewKey!: string
}

class CreateWorkspaceFileAccessGrantDto {
    @IsString()
    fileKey!: string

    @IsOptional()
    @IsString()
    targetId?: string

    @IsIn(['preview', 'download'])
    purpose!: XpertViewFileAccessPurpose
}

@ApiTags('WorkspaceFiles')
@ApiBearerAuth()
@Controller()
export class WorkspaceFileAccessController {
    readonly #logger = new Logger(WorkspaceFileAccessController.name)

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

    @Delete('view-sessions/:sessionId')
    async revokeSession(@Param('sessionId') sessionId: string, @Res({ passthrough: true }) response: Response) {
        await this.service.revokeSession(sessionId)
        response.clearCookie('xpert_workspace_file_access', { path: this.service.buildCookiePath(sessionId) })
        return { success: true }
    }

    @Public()
    @UseGuards(WorkspaceFileAccessGuard)
    @Get('content/:sessionId/:grantId/:fileName')
    streamContent(@Req() request: WorkspaceFileAccessRequest, @Res() response: Response) {
        return this.sendContent(request, response, false)
    }

    @Public()
    @UseGuards(WorkspaceFileAccessGuard)
    @Head('content/:sessionId/:grantId/:fileName')
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
        const origin = this.service.assertRequestOrigin(authorization.session, request)
        const resolved = this.service.resolveAuthorizedFile(authorization)
        const fileStat = await stat(resolved.filePath).catch(() => null)
        if (!fileStat?.isFile()) {
            throw new NotFoundException(
                t('server-ai:Error.WorkspaceFileAccessNotFound', { defaultValue: 'Workspace file was not found.' })
            )
        }

        const { grant } = authorization
        const range = resolveHttpByteRange(request.headers.range, fileStat.size)
        response.setHeader('Accept-Ranges', 'bytes')
        response.setHeader('Cache-Control', 'private, no-store')
        response.setHeader(
            'Content-Type',
            grant.mimeType || getMediaTypeWithCharset(resolved.filePath) || 'application/octet-stream'
        )
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader('Referrer-Policy', 'no-referrer')
        response.setHeader('Content-Disposition', contentDisposition(grant.purpose, grant.fileName))
        if (origin) {
            response.setHeader('Access-Control-Allow-Origin', origin)
            response.setHeader('Access-Control-Allow-Credentials', 'true')
            response.setHeader(
                'Access-Control-Expose-Headers',
                'Accept-Ranges, Content-Length, Content-Range, Content-Type'
            )
            response.setHeader('Vary', 'Origin')
        }

        if (range.kind === 'unsatisfiable') {
            response.setHeader('Content-Range', `bytes */${fileStat.size}`)
            response.status(416).end()
            return
        }

        const start = range.kind === 'partial' ? range.start : undefined
        const end = range.kind === 'partial' ? range.end : undefined
        const contentLength = range.kind === 'partial' ? range.end - range.start + 1 : fileStat.size
        response.setHeader('Content-Length', contentLength)
        if (range.kind === 'partial') {
            response.status(206)
            response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fileStat.size}`)
        }
        if (headOnly) {
            response.end()
            return
        }

        const stream = createReadStream(resolved.filePath, { start, end })
        stream.on('error', (error) => {
            this.#logger.warn(`Workspace file stream failed for grant ${grant.grantId}: ${error.message}`)
            if (!response.headersSent) {
                response.status(404).end()
            } else {
                response.destroy(error)
            }
        })
        response.on('close', () => stream.destroy())
        stream.pipe(response)
    }
}

function contentDisposition(purpose: XpertViewFileAccessPurpose, fileName: string) {
    const fallbackName = fileName.replace(/["\\\r\n]/g, '_')
    const encodedName = encodeURIComponent(fileName)
    return `${purpose === 'download' ? 'attachment' : 'inline'}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`
}
