import { keepAlive, takeUntilClose } from '@xpert-ai/server-common'
import { environment } from '@xpert-ai/server-config'
import {
    GetDefaultTenantQuery,
    Public,
    RequestContext,
    TransformInterceptor,
    UploadFileCommand,
    getFileAssetDestination
} from '@xpert-ai/server-core'
import {
    ISandboxManagedService,
    SandboxManagedServiceErrorCode,
    TSandboxManagedServiceLogs,
    TSandboxManagedServicePreviewSession,
    TSandboxManagedServiceStartInput,
    IChatConversation
} from '@xpert-ai/contracts'
import {
    All,
    BadRequestException,
    ConflictException,
    Body,
    Controller,
    ForbiddenException,
    Get,
    Header,
    Inject,
    Logger,
    NotFoundException,
    Param,
    Post,
    Query,
    Req,
    Res,
    Sse,
    UploadedFile,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Request, Response } from 'express'
import fs from 'fs'
import { I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { Observable } from 'rxjs'
import { VOLUME_CLIENT, VolumeClient, getMediaTypeWithCharset } from '../shared'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { normalizeSandboxPublicVolumeSubpath } from '../shared/volume/volume-layout'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'
import { SandboxPreviewAuthGuard } from './sandbox-preview-auth.guard'
import { SandboxPreviewSessionService } from './sandbox-preview-session.service'
import { SandboxManagedServiceError } from './sandbox-managed-service.error'
import { SandboxManagedServiceService } from './sandbox-managed-service.service'

@ApiTags('Sandbox')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class SandboxController {
    readonly #logger = new Logger(SandboxController.name)
    constructor(
        private readonly i18n: I18nService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly sandboxConversationContextService: SandboxConversationContextService,
        private readonly sandboxManagedServiceService: SandboxManagedServiceService,
        private readonly sandboxPreviewSessionService: SandboxPreviewSessionService,
        private readonly organizationScopeService: SuperAdminOrganizationScopeService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    @Public()
    @Get('volume/*path')
    async getVolumeFile(
        @Param('path') paths: string[],
        @Query('tenant') tenant: string,
        @Query('download') download: string,
        @Res() res: Response
    ) {
        let subpath = paths.join('/')
        if (!tenant) {
            tenant = RequestContext.currentTenantId()
        }
        if (!tenant) {
            const _tenant = await this.queryBus.execute(new GetDefaultTenantQuery())
            tenant = _tenant?.id
        }
        const volume = VolumeClient.getApiContainerSandboxVolumeRoot(tenant)

        if (environment.envName === 'dev') {
            subpath = normalizeSandboxPublicVolumeSubpath(subpath)
        }

        const filePath = join(volume, subpath)
        // Extract the file extension
        const fileName = subpath.split('?')[0].split('/').pop() || ''
        const mediaType = getMediaTypeWithCharset(filePath) || 'text/plain; charset=utf-8'
        const shouldForceDownload = ['1', 'true', 'yes'].includes((download ?? '').trim().toLowerCase())

        // Set the Content-Type header
        res.setHeader('Content-Type', mediaType)

        // Only set Content-Disposition for non-plain-text files (force download)
        const isPlainText =
            mediaType.startsWith('text/') ||
            mediaType === 'application/json' ||
            mediaType === 'application/xml' ||
            mediaType === 'application/javascript' ||
            mediaType === 'application/x-www-form-urlencoded' ||
            mediaType === 'application/markdown' ||
            mediaType === 'application/pdf'
        if (shouldForceDownload || !isPlainText) {
            const encodedFilename = encodeURIComponent(fileName)
            const disposition = shouldForceDownload ? 'attachment' : 'inline; attachment'
            res.setHeader(
                'Content-Disposition',
                `${disposition}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
            )
        }

        const fileStream = fs.createReadStream(filePath)
        fileStream.on('error', (err) => {
            this.#logger.error(`Error reading file ${filePath}:`, err)
            res.status(404).send('File not found')
        })
        fileStream.pipe(res)
        res.on('error', (err) => {
            this.#logger.error(`Error sending file ${filePath}:`, err)
            res.status(500).send('Internal server error')
        })
    }

    /**
     * Upload a file to the volume.
     *
     * @param id
     * @param file
     * @returns File url and the file path relative to the workspace
     */
    @Post('file')
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @Body('workspace') workspace: string,
        @Body('conversationId') conversationId: string,
        @Body('path') path: string,
        @UploadedFile() file: Express.Multer.File,
        @Query('organizationId') organizationId?: string
    ) {
        return this.organizationScopeService.run(organizationId, async () => {
            const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({
                conversationId
            })
            const client = this.createConversationVolumeClient(resolved.conversation)

            const asset = await this.commandBus.execute(
                new UploadFileCommand({
                    source: {
                        kind: 'multipart',
                        file
                    },
                    targets: [
                        {
                            kind: 'sandbox',
                            mode: 'mounted_workspace',
                            workspacePath: client.path(workspace),
                            workspaceUrl: client.publicUrl(workspace),
                            folder: path || ''
                        }
                    ]
                })
            )
            const destination = getFileAssetDestination(asset, 'sandbox')
            if (!destination || destination.status !== 'success') {
                throw new ForbiddenException(destination?.error || 'Failed to upload sandbox file')
            }
            return { url: destination.url, filePath: destination.path }
        })
    }

    @Header('content-type', 'text/event-stream')
    @Header('Connection', 'keep-alive')
    @Post('terminal')
    @Sse()
    async terminal(
        @Body() body: { cmd: string },
        @Query('projectId') projectId: string,
        @Query('conversationId') conversationId: string,
        @Res() res: Response,
        @Query('organizationId') organizationId?: string
    ) {
        const resolved = await this.organizationScopeService.run(organizationId, () =>
            this.sandboxConversationContextService.resolveConversationSandbox({
                conversationId,
                projectId
            })
        )
        const backend = resolved.backend
        const effectiveProjectId = resolved.effectiveProjectId

        return new Observable<string>((subscriber) => {
            let active = true

            void (async () => {
                try {
                    const streamExecute = typeof backend.streamExecute === 'function' ? backend.streamExecute.bind(backend) : null
                    const result = streamExecute
                        ? await streamExecute(body.cmd, (line) => {
                              if (active) {
                                  subscriber.next(line)
                              }
                          })
                        : await backend.execute(body.cmd)

                    if (!active) {
                        return
                    }

                    if (!streamExecute && result.output) {
                        subscriber.next(result.output)
                    }

                    if (result.exitCode === 0) {
                        subscriber.complete()
                        return
                    }

                    const fallbackMessage = effectiveProjectId
                        ? 'Command failed in the project workspace.'
                        : 'Command failed in the xpert workspace.'
                    subscriber.error(result.output || fallbackMessage)
                } catch (error) {
                    if (active) {
                        subscriber.error(error instanceof Error ? error.message : String(error))
                    }
                }
            })()

            return () => {
                active = false
            }
        })
            .pipe(
                // Add an operator to send a comment event periodically (30s) to keep the connection alive
                keepAlive(30000),
                takeUntilClose(res)
            )
    }

    @Get('conversations/:conversationId/services')
    async listManagedServices(
        @Param('conversationId') conversationId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService[]> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.listByConversationId(conversationId)
            )
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    @Post('conversations/:conversationId/services/start')
    async startManagedService(
        @Param('conversationId') conversationId: string,
        @Body() input: TSandboxManagedServiceStartInput,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.startByConversationId(conversationId, input)
            )
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    @Get('conversations/:conversationId/services/:serviceId/logs')
    async getManagedServiceLogs(
        @Param('conversationId') conversationId: string,
        @Param('serviceId') serviceId: string,
        @Query('tail') tail?: string,
        @Query('organizationId') organizationId?: string
    ): Promise<TSandboxManagedServiceLogs> {
        try {
            const parsedTail = tail ? Number.parseInt(tail, 10) : undefined
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.getLogsByConversationId(conversationId, serviceId, parsedTail)
            )
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    @Post('conversations/:conversationId/services/:serviceId/stop')
    async stopManagedService(
        @Param('conversationId') conversationId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.stopByConversationId(conversationId, serviceId)
            )
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    @Post('conversations/:conversationId/services/:serviceId/restart')
    async restartManagedService(
        @Param('conversationId') conversationId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.restartByConversationId(conversationId, serviceId)
            )
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    @Post('conversations/:conversationId/services/:serviceId/preview-session')
    async createManagedServicePreviewSession(
        @Param('conversationId') conversationId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId: string,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<TSandboxManagedServicePreviewSession> {
        try {
            const service = await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.getByConversationId(conversationId, serviceId)
            )
            const session = this.sandboxPreviewSessionService.createSession(service, {
                secure: request.secure || request.headers['x-forwarded-proto'] === 'https'
            })
            response.cookie(session.cookie.name, session.cookie.value, session.cookie.options)
            return {
                expiresAt: session.expiresAt,
                previewUrl: session.previewUrl
            }
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    @Public()
    @UseGuards(SandboxPreviewAuthGuard)
    @All('conversations/:conversationId/services/:serviceId/proxy')
    async proxyManagedServiceRoot(
        @Param('conversationId') conversationId: string,
        @Param('serviceId') serviceId: string,
        @Req() request: Request,
        @Res() response: Response
    ) {
        return this.proxyManagedService(conversationId, serviceId, '/', request, response)
    }

    @Public()
    @UseGuards(SandboxPreviewAuthGuard)
    @All('conversations/:conversationId/services/:serviceId/proxy/')
    async proxyManagedServiceRootWithSlash(
        @Param('conversationId') conversationId: string,
        @Param('serviceId') serviceId: string,
        @Req() request: Request,
        @Res() response: Response
    ) {
        return this.proxyManagedService(conversationId, serviceId, '/', request, response)
    }

    @Public()
    @UseGuards(SandboxPreviewAuthGuard)
    @All('conversations/:conversationId/services/:serviceId/proxy/*path')
    async proxyManagedServicePath(
        @Param('conversationId') conversationId: string,
        @Param('serviceId') serviceId: string,
        @Param('path') paths: string[],
        @Req() request: Request,
        @Res() response: Response
    ) {
        const pathname = `/${(paths ?? []).join('/')}`
        return this.proxyManagedService(conversationId, serviceId, pathname, request, response)
    }

    private createConversationVolumeClient(conversation: Partial<IChatConversation>) {
        if (conversation?.projectId) {
            return this.volumeClient.resolve({
                tenantId: conversation.tenantId,
                userId: conversation.createdById ?? RequestContext.currentUserId(),
                catalog: 'projects',
                projectId: conversation.projectId
            })
        }

        if (conversation?.xpertId) {
            return this.volumeClient.resolve({
                tenantId: conversation.tenantId,
                userId: conversation.createdById ?? RequestContext.currentUserId(),
                catalog: 'xperts',
                xpertId: conversation.xpertId,
                isolateByUser: true
            })
        }

        throw new BadRequestException('Non-project conversations require xpertId for sandbox workspace access')
    }

    private async proxyManagedService(
        conversationId: string,
        serviceId: string,
        pathname: string,
        request: Request,
        response: Response
    ) {
        const queryIndex = request.originalUrl.indexOf('?')
        const query = queryIndex >= 0 ? request.originalUrl.slice(queryIndex) : ''
        const requestPath = `${pathname || '/'}${query}`

        try {
            await this.sandboxManagedServiceService.proxyByConversationId(
                conversationId,
                serviceId,
                requestPath,
                request,
                response
            )
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    private throwManagedServiceHttpError(error: unknown): never {
        if (error instanceof SandboxManagedServiceError) {
            const payload = {
                code: error.code,
                message: error.message
            }

            if (error.statusCode === 404 || error.code === SandboxManagedServiceErrorCode.ServiceNotFound) {
                throw new NotFoundException(payload)
            }

            if (error.statusCode === 409 || error.code === SandboxManagedServiceErrorCode.ServiceNameConflict) {
                throw new ConflictException(payload)
            }

            throw new BadRequestException(payload)
        }

        if (error instanceof ForbiddenException || error instanceof BadRequestException) {
            throw error
        }

        throw new BadRequestException({
            code: SandboxManagedServiceErrorCode.ProviderUnavailable,
            message: error instanceof Error ? error.message : String(error)
        })
    }

}
