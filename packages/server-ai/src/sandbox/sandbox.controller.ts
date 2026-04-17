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
    BadRequestException,
    Body,
    Controller,
    ForbiddenException,
    Get,
    Header,
    Logger,
    Param,
    Post,
    Query,
    Res,
    Sse,
    UploadedFile,
    UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import fs from 'fs'
import { I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { Observable } from 'rxjs'
import { ChatConversationService } from '../chat-conversation'
import { VolumeClient, getMediaTypeWithCharset } from '../shared'
import { normalizeSandboxPublicVolumeSubpath } from '../shared/volume/volume-layout'
import { IChatConversation } from '@xpert-ai/contracts'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'

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
        private readonly conversationService: ChatConversationService,
        private readonly sandboxConversationContextService: SandboxConversationContextService
    ) {}

    @Public()
    @Get('volume/*path')
    async getVolumeFile(@Param('path') paths: string[], @Query('tenant') tenant: string, @Res() res: Response) {
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
        if (!isPlainText) {
            const encodedFilename = encodeURIComponent(fileName)
            res.setHeader(
                'Content-Disposition',
                `inline; attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
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
        @UploadedFile() file: Express.Multer.File
    ) {
        const conversation = await this.conversationService.findOne({ where: { id: conversationId } })
        const client = this.createConversationVolumeClient(conversation)

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
                        workspacePath: client.getVolumePath(workspace),
                        workspaceUrl: client.getPublicUrl(workspace),
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
    }

    @Header('content-type', 'text/event-stream')
    @Header('Connection', 'keep-alive')
    @Post('terminal')
    @Sse()
    async terminal(
        @Body() body: { cmd: string },
        @Query('projectId') projectId: string,
        @Query('conversationId') conversationId: string,
        @Res() res: Response
    ) {
        const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({
            conversationId,
            projectId
        })
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

    private createConversationVolumeClient(conversation: Partial<IChatConversation>) {
        if (conversation?.projectId) {
            return new VolumeClient({
                tenantId: conversation.tenantId,
                userId: conversation.createdById ?? RequestContext.currentUserId(),
                catalog: 'projects',
                projectId: conversation.projectId
            })
        }

        if (conversation?.xpertId) {
            return new VolumeClient({
                tenantId: conversation.tenantId,
                userId: conversation.createdById ?? RequestContext.currentUserId(),
                catalog: 'xperts',
                xpertId: conversation.xpertId,
                isolateByUser: true
            })
        }

        throw new BadRequestException('Non-project conversations require xpertId for sandbox workspace access')
    }

}
