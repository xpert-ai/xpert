import {
    IChatConversationMarkReadRequest,
    IChatConversationUnreadXpertSummary,
    IChatConversationUnreadXpertsRequest,
    IPagination,
    TThreadGoalPatchRequest,
    TThreadGoalSetRequest
} from '@xpert-ai/contracts'
import {
    CrudController,
    PaginationParams,
    ParseJsonPipe,
    RequestContext,
    StorageFilePublicDTO,
    TransformInterceptor,
    transformWhere,
    UUIDValidationPipe
} from '@xpert-ai/server-core'
import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Logger,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Res,
    UploadedFile,
    UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { Like } from 'typeorm'
import { createReadStream } from 'fs'
import type { Response } from 'express'
import archiver from 'archiver'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'
import { ChatConversationPublicDTO, ChatConversationSimpleDTO } from './dto'
import { CancelConversationCommand } from './commands'
import { ChatConversationGoalService } from './goal'

@ApiTags('ChatConversation')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ChatConversationController extends CrudController<ChatConversation> {
    readonly #logger = new Logger(ChatConversationController.name)

    constructor(
        private readonly service: ChatConversationService,
        private readonly goalService: ChatConversationGoalService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly organizationScopeService: SuperAdminOrganizationScopeService
    ) {
        super(service)
    }

    @ApiOperation({ summary: 'find my all' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Found my records'
    })
    @Get('my')
    async findMyAllPublic(
        @Query('data', ParseJsonPipe) filter?: PaginationParams<ChatConversation>,
        @Query('search') search?: string,
        ...options: any[]
    ): Promise<IPagination<ChatConversationPublicDTO>> {
        const where = {
            ...transformWhere(filter.where ?? {}),
            createdById: RequestContext.currentUserId()
        } as any
        if (search) {
            where.title = Like(`%${search}%`)
        }

        const result = await this.service.findAll({ ...filter, where })

        return {
            ...result,
            items: result.items.map((_) => new ChatConversationPublicDTO(_))
        }
    }

    @Post('unread/xperts')
    async getUnreadByXperts(
        @Body() body: IChatConversationUnreadXpertsRequest,
        @Query('organizationId') organizationId?: string
    ): Promise<IChatConversationUnreadXpertSummary[]> {
        return this.organizationScopeService.run(organizationId, () =>
            this.service.getUnreadByXperts(body?.xpertIds ?? [])
        )
    }

    @ApiOperation({ summary: 'Find by id' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Found one record' /*, type: T*/
    })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        description: 'Record not found'
    })
    @Get('by-thread')
    async findOneByThreadId(
        @Query('threadId') threadId: string,
        @Query('organizationId') organizationId?: string
    ): Promise<ChatConversationPublicDTO> {
        return this.organizationScopeService.run(organizationId, async () => {
            const conversation = await this.service.findOneByThreadId(threadId)
            return new ChatConversationPublicDTO(conversation)
        })
    }

    @Get(':id')
    async findOneById(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('organizationId') organizationId: string,
        @Query('$relations', ParseJsonPipe) relations?: PaginationParams<ChatConversation>['relations'],
        @Query('$select', ParseJsonPipe) select?: PaginationParams<ChatConversation>['select'],
        ...options: any[]
    ): Promise<ChatConversationPublicDTO> {
        return this.organizationScopeService.run(organizationId, () =>
            this.service.findOneDetail(id, { select, relations })
        )
    }

    @Get(':id/state')
    async getThreadState(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('organizationId') organizationId?: string
    ): Promise<any> {
        return this.organizationScopeService.run(organizationId, () => this.service.getThreadState(id))
    }

    @ApiOperation({
        summary: 'Get conversation goal',
        description: 'Deprecated compatibility route. Use GET /ai/conversations/{conversation_id}/goal instead.',
        deprecated: true
    })
    @Get(':id/goal')
    async getGoal(@Param('id', UUIDValidationPipe) id: string, @Query('organizationId') organizationId?: string) {
        this.warnLegacyGoalRoute('GET', id, organizationId)
        return this.organizationScopeService.run(organizationId, async () => {
            const conversation = await this.service.findOneInOrganizationOrTenant(id)
            return this.goalService.getByConversationId(conversation.id)
        })
    }

    @ApiOperation({
        summary: 'Set conversation goal',
        description: 'Deprecated compatibility route. Use PUT /ai/conversations/{conversation_id}/goal instead.',
        deprecated: true
    })
    @Put(':id/goal')
    async setGoal(
        @Param('id', UUIDValidationPipe) id: string,
        @Body() body: TThreadGoalSetRequest,
        @Query('organizationId') organizationId?: string
    ) {
        this.warnLegacyGoalRoute('PUT', id, organizationId)
        return this.organizationScopeService.run(organizationId, async () => {
            const conversation = await this.service.findOneInOrganizationOrTenant(id)
            return this.goalService.setGoalFromUser(conversation.id, body)
        })
    }

    @ApiOperation({
        summary: 'Update conversation goal',
        description: 'Deprecated compatibility route. Use PATCH /ai/conversations/{conversation_id}/goal instead.',
        deprecated: true
    })
    @Patch(':id/goal')
    async updateGoal(
        @Param('id', UUIDValidationPipe) id: string,
        @Body() body: TThreadGoalPatchRequest,
        @Query('organizationId') organizationId?: string
    ) {
        this.warnLegacyGoalRoute('PATCH', id, organizationId)
        return this.organizationScopeService.run(organizationId, async () => {
            const conversation = await this.service.findOneInOrganizationOrTenant(id)
            return this.goalService.patchGoalFromUser(conversation.id, body)
        })
    }

    @ApiOperation({
        summary: 'Clear conversation goal',
        description: 'Deprecated compatibility route. Use DELETE /ai/conversations/{conversation_id}/goal instead.',
        deprecated: true
    })
    @Delete(':id/goal')
    async clearGoal(@Param('id', UUIDValidationPipe) id: string, @Query('organizationId') organizationId?: string) {
        this.warnLegacyGoalRoute('DELETE', id, organizationId)
        return this.organizationScopeService.run(organizationId, async () => {
            const conversation = await this.service.findOneInOrganizationOrTenant(id)
            return this.goalService.clearGoalFromUser(conversation.id)
        })
    }

    @Post(':id/read-state')
    async markRead(
        @Param('id', UUIDValidationPipe) id: string,
        @Body() body: IChatConversationMarkReadRequest,
        @Query('organizationId') organizationId?: string
    ) {
        return this.organizationScopeService.run(organizationId, () =>
            this.service.markRead(id, body?.lastReadMessageId)
        )
    }

    @Post(':id/cancel')
    async cancelConversation(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('organizationId') organizationId?: string
    ) {
        try {
            return await this.organizationScopeService.run(organizationId, () =>
                this.commandBus.execute(new CancelConversationCommand({ conversationId: id }))
            )
        } catch (error) {
            console.error('Error cancelling conversation:', error)
            throw error
        }
    }

    @Get('xpert/:id')
    async findByXpert(
        @Param('id', UUIDValidationPipe) xpertId: string,
        @Query('data', ParseJsonPipe) filter?: PaginationParams<ChatConversation>
    ) {
        const result = await this.service.findAllByXpert(xpertId, filter)
        return {
            ...result,
            items: result.items.map((_) => new ChatConversationSimpleDTO(_))
        }
    }

    @Get(':id/attachments')
    async getAttachments(@Param('id') id: string, @Query('organizationId') organizationId?: string) {
        return this.organizationScopeService.run(organizationId, async () => {
            const items = await this.service.getAttachments(id)
            return items.map((_) => new StorageFilePublicDTO(_))
        })
    }

    @Get(':id/files')
    async getFiles(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('organizationId') organizationId: string,
        @Query('deepth') deepth: number,
        @Query('path') path: string
    ) {
        return this.organizationScopeService.run(organizationId, () => this.service.getWorkspaceFiles(id, path, deepth))
    }

    @Get(':id/file')
    async getFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('path') path: string,
        @Query('organizationId') organizationId?: string,
        @Query('fileAssetId') fileAssetId?: string
    ) {
        return this.organizationScopeService.run(organizationId, () =>
            this.service.readWorkspaceFile(id, path, fileAssetId)
        )
    }

    @Get(':id/file/download')
    async downloadFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('path') path: string,
        @Query('organizationId') organizationId: string,
        @Res() res: Response
    ) {
        const file = await this.organizationScopeService.run(organizationId, () =>
            this.service.getWorkspaceFileDownload(id, path)
        )
        const encodedFilename = encodeURIComponent(file.fileName)
        res.setHeader('Content-Type', file.mimeType)
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        )

        if (file.type === 'directory') {
            const archive = archiver('zip', { zlib: { level: 9 } })
            archive.on('error', (error) => {
                res.destroy(error)
            })
            archive.pipe(res)
            archive.directory(file.absolutePath, false)
            await archive.finalize()
            return
        }

        createReadStream(file.absolutePath).pipe(res)
    }

    @Put(':id/file')
    async saveFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('organizationId') organizationId: string,
        @Body() body: { path: string; content: string }
    ) {
        return this.organizationScopeService.run(organizationId, () =>
            this.service.saveWorkspaceFile(id, body?.path, body?.content ?? '')
        )
    }

    @Post(':id/file/upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('organizationId') organizationId: string,
        @Body('path') path: string,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.organizationScopeService.run(organizationId, () => this.service.uploadWorkspaceFile(id, path, file))
    }

    @Delete(':id/file')
    async deleteFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('path') path: string,
        @Query('organizationId') organizationId?: string
    ) {
        return this.organizationScopeService.run(organizationId, () => this.service.deleteWorkspaceFile(id, path))
    }

    private warnLegacyGoalRoute(method: string, conversationId: string, organizationId?: string) {
        this.#logger.warn(
            `Deprecated ${method} /chat-conversation/:id/goal route used; use /ai/conversations/:conversation_id/goal instead. conversationId=${conversationId}${organizationId ? ` organizationId=${organizationId}` : ''}`
        )
    }
}
