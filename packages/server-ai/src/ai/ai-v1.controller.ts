import { IApiKey, IKnowledgebase, IKnowledgeDocument, TChatOptions, TChatRequest, UploadedFile } from '@metad/contracts'
import { keepAlive, takeUntilClose } from '@metad/server-common'
import {
	ApiKeyAuthGuard,
	ApiKeyDecorator,
	FileStorage,
	LazyFileInterceptor,
	Public,
	RequestContext,
	StorageFile,
	StorageFileService,
	UploadedFileStorage
} from '@metad/server-core'
import {
	Body,
	Controller,
	ExecutionContext,
	Get,
	Header,
	Logger,
	Param,
	Post,
	Put,
	Query,
	Res,
	Sse,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import path from 'path'
import { In } from 'typeorm'
import { ChatCommand } from '../chat/commands'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgebaseOwnerGuard } from './guards/knowledgebase'

@ApiTags('AI/v1')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyAuthGuard)
@Controller('v1')
export class AIV1Controller {
	readonly #logger = new Logger(AIV1Controller.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly kbService: KnowledgebaseService,
		private readonly docService: KnowledgeDocumentService,
		private readonly storageFileService: StorageFileService
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

	@UseGuards(KnowledgebaseOwnerGuard)
	@Put('kb/:id')
	async updateKnowledgebase(@Param('id') id: string, @Body() body: Partial<IKnowledgebase>, @ApiKeyDecorator() apiKey: IApiKey) {
		return this.kbService.update(id, body)
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Post('kb/:id/bulk')
	async createDocBulk(@Param('id') id: string, @Body() entities: Partial<IKnowledgeDocument>[], @ApiKeyDecorator() apiKey: IApiKey) {
		return await this.docService.createBulk(entities?.map((entity) => ({...entity, knowledgebaseId: id})))
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Post('kb/:id/process')
	async start(@Param('id') id: string, @Body() ids: string[], @ApiKeyDecorator() apiKey: IApiKey) {
		return this.docService.startProcessing(ids, id)
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Get('kb/:id/status')
	async getStatus(@Query('ids') _ids: string, @ApiKeyDecorator() apiKey: IApiKey) {
		const ids = _ids.split(',').map((id) => id.trim())
		const { items } = await this.docService.findAll({
			select: ['id', 'status', 'progress', 'processMsg'],
			where: { id: In(ids) }
		})
		return items
	}

	@Post('file')
	@UseInterceptors(
		LazyFileInterceptor('file', {
			storage: (request: ExecutionContext) => {
				return new FileStorage().storage({
					dest: path.join('files'),
					prefix: 'files'
				})
			}
		})
	)
	async create(@Body() entity: StorageFile, @UploadedFileStorage() file: UploadedFile, @ApiKeyDecorator() apiKey: IApiKey) {
		return await this.storageFileService.createStorageFile(file)
	}
}
