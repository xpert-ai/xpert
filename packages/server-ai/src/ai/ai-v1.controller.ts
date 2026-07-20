import {
    IApiKey,
    IFileAssetDestination,
    IStorageFile,
    IUploadFileTarget,
    SecretTokenBindingType,
    TChatOptions,
    TChatRequest
} from '@xpert-ai/contracts'
import { keepAlive, takeUntilClose } from '@xpert-ai/server-common'
import {
    ApiKeyOrClientSecretAuthGuard,
    ApiKeyDecorator,
    Public,
    RequestContext,
    SecretTokenService,
    UploadFileCommand,
    getFileAssetDestination,
    getStorageFileFromAsset
} from '@xpert-ai/server-core'
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Header,
    Logger,
    Param,
    Post,
    Put,
    Query,
    Res,
    Sse,
    UploadedFile,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { randomBytes } from 'crypto'
import { In } from 'typeorm'
import { ChatCommand } from '../chat/commands'
import { CreateKnowledgebaseDTO, KnowledgebaseService } from '../knowledgebase'
import { KnowledgebaseOwnerGuard } from './guards/knowledgebase'
import { KnowledgeDocumentService } from '../knowledge-document'
import { KnowledgeDocument } from '../core/entities/internal'
import { PublishedXpertAccessService } from '../xpert'

const DEFAULT_CHATKIT_SESSION_EXPIRES_AFTER = 600
const MAX_USER_CHATKIT_SESSION_EXPIRES_AFTER = 3600

@ApiTags('AI/v1')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@Controller('v1')
export class AIV1Controller {
    readonly #logger = new Logger(AIV1Controller.name)

    constructor(
        private readonly queryBus: QueryBus,
        private readonly commandBus: CommandBus,
        private readonly kbService: KnowledgebaseService,
        private readonly docService: KnowledgeDocumentService,
        private readonly secretTokenService: SecretTokenService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService
    ) {}

    @Header('content-type', 'text/event-stream')
    @Header('Connection', 'keep-alive')
    @Post('chat')
    @Sse()
    async chat(@Res() res: Response, @Body() body: { request: TChatRequest; options: TChatOptions }) {
        return (
            await this.commandBus.execute(
                new ChatCommand(body.request, {
                    ...(body.options ?? {}),
                    tenantId: RequestContext.currentTenantId(),
                    organizationId: RequestContext.getOrganizationId(),
                    user: RequestContext.currentUser(),
                    from: 'api'
                })
            )
        ).pipe(
            takeUntilClose(res),
            // Add an operator to send a comment event periodically (30s) to keep the connection alive
            keepAlive(30000)
        )
    }

    @Post('kb')
    @ApiBody({
        type: CreateKnowledgebaseDTO,
        description: 'Knowledgebase'
    })
    async createKnowledgebase(@Body() body: CreateKnowledgebaseDTO) {
        return this.kbService.create(body)
    }

    @UseGuards(KnowledgebaseOwnerGuard)
    @Put('kb/:id')
    @ApiBody({
        type: CreateKnowledgebaseDTO,
        description: 'Knowledgebase'
    })
    async updateKnowledgebase(@Param('id') id: string, @Body() body: CreateKnowledgebaseDTO) {
        return this.kbService.update(id, body)
    }

    @UseGuards(KnowledgebaseOwnerGuard)
    @Delete('kb/:id')
    async deleteKnowledgebase(@Param('id') id: string, @ApiKeyDecorator() apiKey: IApiKey) {
        return this.kbService.delete(id)
    }

    @UseGuards(KnowledgebaseOwnerGuard)
    @Post('kb/:id/bulk')
    @ApiBody({
        type: [KnowledgeDocument],
        description: 'Knowledge documents'
    })
    async createDocBulk(@Param('id') id: string, @Body() entities: KnowledgeDocument[]) {
        return await this.docService.createBulk(entities?.map((entity) => ({ ...entity, knowledgebaseId: id })))
    }

    @UseGuards(KnowledgebaseOwnerGuard)
    @Post('kb/:id/process')
    async start(@Param('id') id: string, @Body() ids: string[]) {
        return this.docService.startProcessing(ids, id)
    }

    @UseGuards(KnowledgebaseOwnerGuard)
    @Get('kb/:id/status')
    async getStatus(@Query('ids') _ids: string) {
        const ids = _ids.split(',').map((id) => id.trim())
        const { items } = await this.docService.findAll({
            select: ['id', 'status', 'progress', 'processMsg'],
            where: { id: In(ids) }
        })
        return items
    }

    @Post('file')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        description: 'Upload a file. The optional target field must be a JSON-encoded IUploadFileTarget.',
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: {
                    type: 'string',
                    format: 'binary'
                },
                target: {
                    type: 'string',
                    description:
                        'Optional JSON-encoded target. Defaults to {"kind":"storage","directory":"files","prefix":"files"}.'
                }
            }
        }
    })
    /**
     * @deprecated Use POST /contexts/file. The context endpoint returns an
     * AgentFile/FileAsset handle and starts the file-understanding parse flow.
     */
    async create(
        @UploadedFile() file: Express.Multer.File,
        @Body('target') targetValue?: string
    ): Promise<IStorageFile | IFileAssetDestination> {
        const target = this.resolveUploadTarget(targetValue)
        const asset = await this.commandBus.execute(
            new UploadFileCommand({
                source: {
                    kind: 'multipart',
                    file
                },
                targets: [target]
            })
        )

        const destination = getFileAssetDestination(asset, target.kind)
        if (!destination || destination.status !== 'success') {
            throw new BadRequestException(destination?.error || `Failed to upload file to target '${target.kind}'`)
        }

        if (target.kind === 'storage') {
            const storageFile = getStorageFileFromAsset(asset)
            if (!storageFile) {
                throw new BadRequestException('Failed to upload file')
            }
            return storageFile
        }

        return destination
    }

    @Post('chatkit/sessions')
    async createChatkitSession(
        @ApiKeyDecorator() apiKey: IApiKey,
        @Body()
        body: {
            assistant?: { id?: string }
            user?: string
            /**
             * Optional override for session expiration timing in seconds from creation. Defaults to 10 minutes.
             */
            expires_after?: number
        }
    ) {
        const token = `cs-x-${randomBytes(32).toString('hex')}`

        const requestedSessionLifetime = body?.expires_after
        const requestedExpiresAfter =
            typeof requestedSessionLifetime === 'number' &&
            Number.isFinite(requestedSessionLifetime) &&
            requestedSessionLifetime > 0
                ? Math.floor(requestedSessionLifetime)
                : DEFAULT_CHATKIT_SESSION_EXPIRES_AFTER
        const expires_after = apiKey?.id
            ? requestedExpiresAfter
            : Math.min(requestedExpiresAfter, MAX_USER_CHATKIT_SESSION_EXPIRES_AFTER)
        const validUntil = new Date(Date.now() + 1000 * expires_after)

        // Keep service callers on the existing API-key grant. A user session
        // needs a different binding because it must restore the real user and
        // constrain the resulting client secret to one assistant.
        if (apiKey?.id) {
            await this.secretTokenService.create({
                entityId: apiKey.id,
                type: SecretTokenBindingType.API_KEY,
                tenantId: apiKey.tenantId,
                organizationId: apiKey.organizationId,
                token,
                validUntil
            })
        } else {
            const currentUser = RequestContext.currentUser()
            const assistantId = body?.assistant?.id?.trim()
            if (!currentUser?.id || !currentUser.tenantId) {
                throw new BadRequestException('Current user context is required to create a ChatKit session.')
            }
            if (!assistantId) {
                throw new BadRequestException('assistant.id is required to create a user ChatKit session.')
            }
            if (body?.user?.trim() && body.user.trim() !== currentUser.id) {
                throw new BadRequestException('ChatKit session user must match the authenticated user.')
            }

            await this.publishedXpertAccessService.getAccessiblePublishedXpert(assistantId)
            await this.secretTokenService.create({
                // USER_XPERT makes entityId an assistant audience and makes
                // createdById the acting user. createdById alone is not enough
                // because API_KEY and PUBLIC_XPERT secrets also have creators.
                entityId: assistantId,
                type: SecretTokenBindingType.USER_XPERT,
                tenantId: currentUser.tenantId,
                organizationId: RequestContext.getOrganizationId() ?? null,
                createdById: currentUser.id,
                token,
                validUntil
            })
        }

        return {
            client_secret: token,
            expires_at: validUntil,
            expires_after: expires_after
        }
    }

    private resolveUploadTarget(targetValue?: string): IUploadFileTarget {
        const defaultTarget: IUploadFileTarget = {
            kind: 'storage',
            directory: 'files',
            prefix: 'files'
        }

        if (!targetValue) {
            return defaultTarget
        }

        const target = this.parseJson<IUploadFileTarget>(targetValue, 'target')
        if (!target || Array.isArray(target) || !target.kind) {
            throw new BadRequestException('Invalid target payload')
        }

        if (target.kind === 'storage') {
            return {
                ...defaultTarget,
                ...target
            }
        }

        return target
    }

    private parseJson<T>(value: string, field: string): T {
        try {
            return JSON.parse(value) as T
        } catch {
            throw new BadRequestException(`Invalid ${field} JSON`)
        }
    }
}
