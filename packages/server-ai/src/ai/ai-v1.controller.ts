import {
	IApiKey,
	IFileAssetDestination,
	IStorageFile,
	IUploadFileTarget,
	TChatOptions,
	TChatRequest
} from '@metad/contracts'
import { keepAlive, takeUntilClose } from '@metad/server-common'
import {
	ApiKeyAuthGuard,
	ApiKeyOrClientSecretAuthGuard,
	ApiKeyDecorator,
	Public,
	RequestContext,
	SecretTokenService,
	UploadFileCommand,
	getFileAssetDestination,
	getStorageFileFromAsset
} from '@metad/server-core'
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
		private readonly secretTokenService: SecretTokenService
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
	@UseGuards(ApiKeyAuthGuard)
	async createChatkitSession(
		@ApiKeyDecorator() apiKey: IApiKey,
		@Body()
		body: {
			/**
			 * Optional override for session expiration timing in seconds from creation. Defaults to 10 minutes.
			 */
			expires_after?: number
		}
	) {
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
