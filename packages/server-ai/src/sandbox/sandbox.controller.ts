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
    TSandboxManagedServiceStartInput
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
import { t } from 'i18next'
import { I18nService } from 'nestjs-i18n'
import { isAbsolute, relative } from 'path'
import { Observable } from 'rxjs'
import { getMediaTypeWithCharset } from '../shared/utils/utils'
import { resolveHttpByteRange } from '../shared/utils/http-byte-range'
import {
    VOLUME_CLIENT,
    VolumeClient,
    VolumeHandle,
    assertValidVolumeScopeId
} from '../shared/volume/volume'
import { isProjectGovernedContentPath } from '../shared/volume/project-content-path'
import { WorkspacePathMapperFactory } from '../shared/volume/workspace-path-mapper.factory'
import { normalizeFileName, normalizeRelativePath } from '../shared/file-upload-targets/utils'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import {
    normalizeSandboxPublicVolumeSubpath,
    normalizeSandboxVolumeRequestSubpath
} from '../shared/volume/volume-layout'
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
        private readonly workspaceMappers: WorkspacePathMapperFactory,
        private readonly projectAccessService: XpertProjectAccessService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    @Get('volume/project/:projectId/*path')
    async getProjectVolumeFile(
        @Param('projectId') projectId: string,
        @Param('path') paths: string[],
        @Query('tenant') requestedTenantId: unknown,
        @Query('download') download: unknown,
        @Req() req: Request,
        @Res() res: Response
    ) {
        projectId = this.normalizeVolumeScopeIdentifier(projectId, 'projectId')
        const requestedTenant = this.normalizeOptionalVolumeQueryString(requestedTenantId, 'tenant')
        const normalizedDownload = this.normalizeOptionalVolumeQueryString(download, 'download')
        const { project } = await this.projectAccessService.assertCanRead(projectId)
        const tenantId = this.normalizeVolumeScopeIdentifier(project.tenantId, 'tenantId')
        if (requestedTenant && requestedTenant !== tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectVolumeCrossTenant', {
                    defaultValue: 'Project files cannot be read from another tenant'
                })
            )
        }

        const volume = this.volumeClient.resolve({ tenantId, catalog: 'projects', projectId })
        const subpath = this.normalizeVolumeRequestSubpath(paths)
        return this.serveVolumeFile(volume.serverRoot, subpath, normalizedDownload, req, res)
    }

    @Get('volume/user/:userId/xpert/:xpertId/*path')
    async getUserXpertVolumeFile(
        @Param('userId') userId: string,
        @Param('xpertId') xpertId: string,
        @Param('path') paths: string[],
        @Query('tenant') requestedTenantId: unknown,
        @Query('download') download: unknown,
        @Req() req: Request,
        @Res() res: Response
    ) {
        return this.servePrivateXpertVolumeFile(
            { catalog: 'user-xperts', userId, xpertId },
            paths,
            requestedTenantId,
            download,
            req,
            res
        )
    }

    @Get('volume/xpert/:xpertId/user/:userId/*path')
    async getLegacyUserXpertVolumeFile(
        @Param('xpertId') xpertId: string,
        @Param('userId') userId: string,
        @Param('path') paths: string[],
        @Query('tenant') requestedTenantId: unknown,
        @Query('download') download: unknown,
        @Req() req: Request,
        @Res() res: Response
    ) {
        return this.servePrivateXpertVolumeFile(
            { catalog: 'xperts', userId, xpertId, isolateByUser: true },
            paths,
            requestedTenantId,
            download,
            req,
            res
        )
    }

    @Public()
    @Get('volume/*path')
    async getVolumeFile(
        @Param('path') paths: string[],
        @Query('tenant') requestedTenant: unknown,
        @Query('download') requestedDownload: unknown,
        @Req() req: Request,
        @Res() res: Response
    ) {
        let subpath = this.normalizeVolumeRequestSubpath(paths)
        let tenant = this.normalizeOptionalVolumeQueryString(requestedTenant, 'tenant')
        const download = this.normalizeOptionalVolumeQueryString(requestedDownload, 'download')
        if (isProtectedVolumeSubpath(subpath)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProtectedVolumeAuthenticationRequired', {
                    defaultValue: 'Project and user-isolated Xpert files require authenticated access'
                })
            )
        }
        if (!tenant) {
            tenant = RequestContext.currentTenantId()
        }
        if (!tenant) {
            const _tenant = await this.queryBus.execute(new GetDefaultTenantQuery())
            tenant = _tenant?.id
        }
        tenant = this.normalizeVolumeScopeIdentifier(tenant, 'tenantId')
        const volume = VolumeClient.getApiContainerSandboxVolumeRoot(tenant)

        if (environment.envName === 'dev') {
            subpath = normalizeSandboxPublicVolumeSubpath(subpath)
        }
        if (isProtectedVolumeSubpath(subpath)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProtectedVolumeAuthenticationRequired', {
                    defaultValue: 'Project and user-isolated Xpert files require authenticated access'
                })
            )
        }

        return this.serveVolumeFile(volume, subpath, download, req, res, { rejectProtectedPaths: true })
    }

    private async servePrivateXpertVolumeFile(
        scope: {
            catalog: 'user-xperts' | 'xperts'
            userId: string
            xpertId: string
            isolateByUser?: true
        },
        paths: string[],
        requestedTenant: unknown,
        requestedDownload: unknown,
        req: Request,
        res: Response
    ) {
        const requestedTenantId = this.normalizeOptionalVolumeQueryString(requestedTenant, 'tenant')
        const download = this.normalizeOptionalVolumeQueryString(requestedDownload, 'download')
        const userId = this.normalizeVolumeScopeIdentifier(scope.userId, 'userId')
        const xpertId = this.normalizeVolumeScopeIdentifier(scope.xpertId, 'xpertId')
        const tenantId = RequestContext.currentTenantId()
        const currentUserId = RequestContext.currentUserId()
        if (!tenantId || !currentUserId || currentUserId !== userId) {
            throw new ForbiddenException(
                t('server-ai:Error.UserXpertVolumePrivate', {
                    defaultValue: 'User-isolated Xpert files are private to the current user'
                })
            )
        }
        if (requestedTenantId && requestedTenantId !== tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.UserXpertVolumeCrossTenant', {
                    defaultValue: 'User-isolated Xpert files cannot be read from another tenant'
                })
            )
        }

        const volume = this.volumeClient.resolve({ ...scope, userId, xpertId, tenantId })
        const subpath = this.normalizeVolumeRequestSubpath(paths)
        return this.serveVolumeFile(volume.serverRoot, subpath, download, req, res)
    }

    private normalizeOptionalVolumeQueryString(value: unknown, field: string) {
        if (value === undefined || value === null || value === '') {
            return undefined
        }
        if (typeof value !== 'string') {
            throw new BadRequestException(
                t('server-ai:Error.SandboxVolumeQueryParameterInvalid', {
                    field,
                    defaultValue: 'Sandbox volume query parameter {{field}} must be a single string value'
                })
            )
        }
        return value
    }

    private normalizeVolumeScopeIdentifier(value: unknown, field: string) {
        try {
            if (typeof value !== 'string') {
                throw new Error('Invalid volume scope identifier')
            }
            return assertValidVolumeScopeId(value, field)
        } catch {
            throw new BadRequestException(
                t('server-ai:Error.VolumeScopeIdentifierInvalid', {
                    field,
                    defaultValue: 'Volume scope identifier {{field}} must be a single path segment'
                })
            )
        }
    }

    private normalizeVolumeRequestSubpath(paths: string[]) {
        const subpath = normalizeSandboxVolumeRequestSubpath(paths.join('/'))
        if (!subpath) {
            throw new BadRequestException(
                t('server-ai:Error.SandboxVolumeInvalidPath', {
                    defaultValue: 'Invalid sandbox volume path'
                })
            )
        }
        return subpath
    }

    private async serveVolumeFile(
        volumeRoot: string,
        subpath: string,
        download: string | undefined,
        req: Request,
        res: Response,
        options?: { rejectProtectedPaths?: boolean }
    ) {
        // Extract the file extension
        const fileName = subpath.split('?')[0].split('/').pop() || ''
        let filePath = VolumeHandle.resolvePath(volumeRoot, subpath)
        let fileStat: fs.Stats
        let fileHandle: fs.promises.FileHandle
        try {
            const openedFile = await VolumeHandle.openExistingFile(volumeRoot, subpath)
            fileHandle = openedFile.fileHandle
            filePath = openedFile.filePath
            fileStat = openedFile.fileStat
            if (options?.rejectProtectedPaths && isProtectedVolumeSubpath(openedFile.volumeRelativePath)) {
                await fileHandle.close()
                throw new ForbiddenException(
                    t('server-ai:Error.ProtectedVolumeAuthenticationRequired', {
                        defaultValue: 'Project and user-isolated Xpert files require authenticated access'
                    })
                )
            }
            if (!fileStat.isFile()) {
                await fileHandle.close()
                res.status(404).send('File not found')
                return
            }
            if (res.destroyed || res.writableEnded) {
                await fileHandle.close()
                return
            }
        } catch (err) {
            if (err instanceof ForbiddenException) {
                throw err
            }
            this.#logger.error(`Error reading file ${filePath}:`, err)
            res.status(404).send('File not found')
            return
        }

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
            const disposition = shouldForceDownload ? 'attachment' : 'inline'
            res.setHeader(
                'Content-Disposition',
                `${disposition}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
            )
        }

        res.setHeader('Accept-Ranges', 'bytes')
        const range = resolveHttpByteRange(req.headers.range, fileStat.size)
        if (range.kind === 'unsatisfiable') {
            await fileHandle.close()
            res.setHeader('Content-Range', `bytes */${fileStat.size}`)
            res.status(416).end()
            return
        }

        let fileStream: fs.ReadStream
        if (range.kind === 'partial') {
            const contentLength = range.end - range.start + 1
            res.status(206)
            res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fileStat.size}`)
            res.setHeader('Content-Length', contentLength)
            fileStream = fileHandle.createReadStream({ start: range.start, end: range.end })
        } else {
            res.setHeader('Content-Length', fileStat.size)
            fileStream = fileHandle.createReadStream()
        }

        fileStream.on('error', (err) => {
            this.#logger.error(`Error reading file ${filePath}:`, err)
            if (!res.headersSent) {
                res.status(404).send('File not found')
            } else {
                res.destroy(err)
            }
        })
        res.once('close', () => fileStream.destroy())
        fileStream.pipe(res)
        res.on('error', (err) => {
            this.#logger.error(`Error sending file ${filePath}:`, err)
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
        @Body('path') folderPath: string,
        @UploadedFile() file: Express.Multer.File,
        @Query('organizationId') organizationId?: string
    ) {
        return this.organizationScopeService.run(organizationId, async () => {
            const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({
                conversationId
            })
            const volume = this.volumeClient.resolve(resolved.volumeScope)
            const workspacePath = this.resolveUploadWorkspacePath(resolved, volume, workspace)
            this.assertProjectUploadAllowed(resolved, volume, workspacePath, folderPath, file.originalname)
            const workspaceUrl = this.resolveWorkspacePublicUrl(volume, workspacePath)

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
                            workspacePath,
                            workspaceBoundaryPath: volume.serverRoot,
                            projectContentReadOnly: !!resolved.effectiveProjectId,
                            workspaceUrl,
                            folder: folderPath || ''
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

    private resolveUploadWorkspacePath(
        resolved: Awaited<ReturnType<SandboxConversationContextService['resolveConversationSandbox']>>,
        volume: VolumeHandle,
        workspace?: string | null
    ) {
        const requestedWorkspace = workspace?.trim()
        const mapper = this.workspaceMappers.forProvider(resolved.provider)
        if (!requestedWorkspace) {
            return mapper.mapWorkspaceToVolume(resolved.workspaceBinding, resolved.workingDirectory)
        }
        if (
            requestedWorkspace === resolved.workspaceBinding.workspaceRoot ||
            requestedWorkspace.startsWith(`${resolved.workspaceBinding.workspaceRoot}/`)
        ) {
            return mapper.mapWorkspaceToVolume(resolved.workspaceBinding, requestedWorkspace)
        }
        if (requestedWorkspace === volume.serverRoot || requestedWorkspace.startsWith(`${volume.serverRoot}/`)) {
            return requestedWorkspace
        }
        if (isAbsolute(requestedWorkspace)) {
            throw new BadRequestException('Invalid sandbox workspace path')
        }
        return volume.path(requestedWorkspace)
    }

    private resolveWorkspacePublicUrl(volume: VolumeHandle, workspacePath: string) {
        const relativePath = relative(volume.serverRoot, workspacePath).replace(/\\/g, '/')
        if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
            throw new BadRequestException('Invalid sandbox workspace path')
        }
        return volume.exposesDirectFileUrls() ? volume.publicUrl(relativePath === '.' ? '' : relativePath) : undefined
    }

    private assertProjectUploadAllowed(
        resolved: Awaited<ReturnType<SandboxConversationContextService['resolveConversationSandbox']>>,
        volume: VolumeHandle,
        workspacePath: string,
        folderPath: string | undefined,
        originalName: string
    ) {
        if (!resolved.effectiveProjectId) return
        const workspaceRelativePath = relative(volume.serverRoot, workspacePath).replace(/\\/g, '/')
        const filePath = normalizeRelativePath(
            workspaceRelativePath === '.' ? '' : workspaceRelativePath,
            folderPath,
            normalizeFileName(originalName)
        )
        if (isProjectGovernedContentPath(filePath)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectContentGenericWriteForbidden', {
                    defaultValue: 'Project instructions and skills must be changed from Project configuration'
                })
            )
        }
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
                    const streamExecute =
                        typeof backend.streamExecute === 'function' ? backend.streamExecute.bind(backend) : null
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
        }).pipe(
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

    @Get('conversations/:conversationId/services/:serviceId')
    async getManagedService(
        @Param('conversationId') conversationId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.getByConversationId(conversationId, serviceId)
            )
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    @Get('threads/:threadId/services')
    async listManagedServicesByThread(
        @Param('threadId') threadId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService[]> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.listByThreadId(threadId)
            )
        } catch (error) {
            this.throwManagedServiceHttpError(error)
        }
    }

    @Get('threads/:threadId/services/:serviceId')
    async getManagedServiceByThread(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.getByThreadId(threadId, serviceId)
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

    @Post('threads/:threadId/services/start')
    async startManagedServiceByThread(
        @Param('threadId') threadId: string,
        @Body() input: TSandboxManagedServiceStartInput,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.startByThreadId(threadId, input)
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

    @Get('threads/:threadId/services/:serviceId/logs')
    async getManagedServiceLogsByThread(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('tail') tail?: string,
        @Query('organizationId') organizationId?: string
    ): Promise<TSandboxManagedServiceLogs> {
        try {
            const parsedTail = tail ? Number.parseInt(tail, 10) : undefined
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.getLogsByThreadId(threadId, serviceId, parsedTail)
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

    @Post('threads/:threadId/services/:serviceId/stop')
    async stopManagedServiceByThread(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.stopByThreadId(threadId, serviceId)
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

    @Post('threads/:threadId/services/:serviceId/restart')
    async restartManagedServiceByThread(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ISandboxManagedService> {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.restartByThreadId(threadId, serviceId)
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

    @Post('threads/:threadId/services/:serviceId/preview-session')
    async createManagedServicePreviewSessionByThread(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId: string,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<TSandboxManagedServicePreviewSession> {
        try {
            const service = await this.organizationScopeService.run(organizationId, () =>
                this.sandboxManagedServiceService.getByThreadId(threadId, serviceId)
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

function isUserXpertVolumeSubpath(value: string) {
    const normalized = value.replace(/\\/g, '/')
    return (
        /^\/?user\/[^/]+\/xpert\/[^/]+(?:\/|$)/.test(normalized) ||
        /^\/?xpert\/[^/]+\/user\/[^/]+(?:\/|$)/.test(normalized)
    )
}

function isProjectVolumeSubpath(value: string) {
    return /^\/?project\/[^/]+(?:\/|$)/.test(value.replace(/\\/g, '/'))
}

function isRuntimeJobVolumeSubpath(value: string) {
    const segments: string[] = []
    for (const segment of value.replace(/\\/g, '/').split('/')) {
        if (!segment || segment === '.') continue
        if (segment === '..') {
            segments.pop()
            continue
        }
        segments.push(segment)
    }
    return segments[0]?.toLowerCase() === 'runtime-jobs'
}

function isProtectedVolumeSubpath(value: string) {
    return isProjectVolumeSubpath(value) || isUserXpertVolumeSubpath(value) || isRuntimeJobVolumeSubpath(value)
}
