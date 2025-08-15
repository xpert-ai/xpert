import { environment } from '@metad/server-config'
import { GetDefaultTenantQuery, Public, RequestContext, TransformInterceptor } from '@metad/server-core'
import {
	Body,
	Controller,
	Get,
	Logger,
	Param,
	Post,
	Query,
	Res,
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
import { ChatConversationService } from '../chat-conversation'
import { VolumeClient, getMediaTypeWithCharset } from '../shared'


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
	) {}

	@Public()
	@Get('volume/**')
	async getVolumeFile(@Param('0') path: string, @Query('tenant') tenant: string, @Res() res: Response) {
		if (!tenant) {
			tenant = RequestContext.currentTenantId()
		}
		if (!tenant) {
			const _tenant = await this.queryBus.execute(new GetDefaultTenantQuery())
			tenant = _tenant?.id
		}
		const volume = VolumeClient.getSandboxVolumeRoot(tenant)

		if (environment.envName === 'dev') {
			// Remove leading "/users/{uuid}/" or "/projects/{uuid}/" from path if present
			const leadingPathRegex = /^(users|projects)\/[0-9a-fA-F-]{36}\//
			if (leadingPathRegex.test(path)) {
				path = path.replace(leadingPathRegex, '')
			}
		}

		const filePath = `${volume}/${path}`
		// Extract the file extension
		const fileName = path.split('?')[0].split('/').pop() || ''
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
	async uploadFile(@Body('workspace') workspace: string,
		@Body('conversationId') conversationId: string,
		@Body('path') path: string,
		@UploadedFile() file: Express.Multer.File
	) {
		const conversation = await this.conversationService.findOne({ where: { id: conversationId } })
		const client = new VolumeClient({
			tenantId: RequestContext.currentTenantId(),
			userId: RequestContext.currentUserId(),
			projectId: conversation.projectId
		})

		const targetFolder = path || ''
		const filePath = join(targetFolder, file.originalname)
		const url = await client.putFile(join(workspace, targetFolder), {
			...file,
			originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
		})
		return { url, filePath }
	}
}
