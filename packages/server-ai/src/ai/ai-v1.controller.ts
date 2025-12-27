import { IApiKey, TChatOptions, TChatRequest, UploadedFile } from '@metad/contracts'
import { keepAlive, takeUntilClose } from '@metad/server-common'
import {
	ApiKeyAuthGuard,
	ApiKeyOrClientSecretAuthGuard,
	ApiKeyDecorator,
	FileStorage,
	LazyFileInterceptor,
	Public,
	RequestContext,
	SecretTokenService,
	StorageFileService,
	UploadedFileStorage
} from '@metad/server-core'
import {
	Body,
	Controller,
	Delete,
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
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { randomBytes } from 'crypto'
import path from 'path'
import { In } from 'typeorm'
import { ChatCommand } from '../chat/commands'
import { CreateKnowledgebaseDTO, KnowledgebaseService } from '../knowledgebase'
import { KnowledgebaseOwnerGuard } from './guards/knowledgebase'
import { KnowledgeDocumentService } from '../knowledge-document'
import { KnowledgeDocument } from '../core/entities/internal'

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

	@Post('kb')
	@ApiBody({ 
		type: CreateKnowledgebaseDTO,
		description: 'Knowledgebase',
	})
	async createKnowledgebase(@Body() body: CreateKnowledgebaseDTO) {
		return this.kbService.create(body)
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Put('kb/:id')
	@ApiBody({
		type: CreateKnowledgebaseDTO,
		description: 'Knowledgebase',
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
		description: 'Knowledge documents',
	})
	async createDocBulk(@Param('id') id: string, @Body() entities: KnowledgeDocument[]) {
		return await this.docService.createBulk(entities?.map((entity) => ({...entity, knowledgebaseId: id})))
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
	async create(@UploadedFileStorage() file: UploadedFile) {
		return await this.storageFileService.createStorageFile(file)
	}

	@Post('chatkit/sessions')
	@UseGuards(ApiKeyAuthGuard)
	async createChatkitSession(@ApiKeyDecorator() apiKey: IApiKey, @Body() body: {
		/**
		 * Optional override for session expiration timing in seconds from creation. Defaults to 10 minutes.
		 */
		expires_after?: number
	}) {
		const token = `cs-x-${randomBytes(32).toString('hex')}`

		const expires_after = body.expires_after && body.expires_after > 0 ? body.expires_after : 600
		const validUntil = new Date(Date.now() + 1000 * expires_after)

		await this.secretTokenService.create({
			entityId: apiKey?.id,
			token,
			validUntil
		})

		return {
			client_secret: token,
			expires_at: validUntil,
			expires_after: expires_after
		}
	}
}
