import { BaseMessage, mapChatMessagesToStoredMessages } from '@langchain/core/messages'
import { LanguagesEnum, TChatOptions, TChatRequest, UploadedFile } from '@metad/contracts'
import { keepAlive, takeUntilClose } from '@metad/server-common'
import { FileStorage, LazyFileInterceptor, RequestContext, TimeZone, UploadedFileStorage } from '@metad/server-core'
import {
	Body,
	Controller,
	ExecutionContext,
	Get,
	Header,
	HttpStatus,
	Logger,
	Post,
	Query,
	Res,
	Sse,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { I18nLang } from 'nestjs-i18n'
import path from 'path'
import { from, map } from 'rxjs'
import { ChatCommand, SpeechToTextCommand, SynthesizeCommand } from './commands'

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
	readonly #logger = new Logger(ChatController.name)
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Post('')
	@Sse()
	async chat(
		@Res() res: Response,
		@I18nLang() language: LanguagesEnum,
		@TimeZone() timeZone: string,
		@Body() body: { request: TChatRequest; options: TChatOptions }
	) {
		const observable = await this.commandBus.execute(
			new ChatCommand(body.request, {
				...(body.options ?? {}),
				language,
				timeZone,
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId(),
				user: RequestContext.currentUser(),
				from: 'platform'
			})
		)

		return observable.pipe(
			// Add an operator to send a comment event periodically (30s) to keep the connection alive
			keepAlive(30000),
			takeUntilClose(res)
		)
	}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Get('synthesize')
	@Sse()
	async synthesize(
		@Res() res: Response,
		@Query('conversation_id') conversationId: string,
		@Query('message_id') messageId: string,
		@Query('voice') voice: string,
		@Query('language') language: string,
		@Query('draft') draft: string
	) {
		const abortController = new AbortController()
		res.on('close', () => {
			abortController.abort()
		})
		const observable = from(
			await this.commandBus.execute(
				new SynthesizeCommand({
					conversationId,
					messageId,
					signal: abortController.signal,
					isDraft: draft === 'true'
				})
			)
		)

		return observable.pipe(
			map((data) => {
				return {
					data: mapChatMessagesToStoredMessages([data as BaseMessage])[0]
				} as MessageEvent
			}),
			// Add an operator to send a comment event periodically (30s) to keep the connection alive
			keepAlive(30000),
			takeUntilClose(res)
		)
	}

	@ApiOperation({ summary: 'Upload audio file' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'The storage file has been successfully upload.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@Post('speech-to-text')
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
	async speechToText(
		@UploadedFileStorage() file: UploadedFile,
		@Body() body: { xpertId?: string; isDraft?: string }
	) {
		return await this.commandBus.execute(
			new SpeechToTextCommand(file, {
				xpertId: body.xpertId,
				isDraft: body.isDraft === 'true'
			})
		)
	}
}
