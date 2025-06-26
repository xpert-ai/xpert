import { IPagination } from '@metad/contracts'
import { keepAlive, takeUntilClose } from '@metad/server-common'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	RequestContext,
	StorageFilePublicDTO,
	TransformInterceptor,
	UUIDValidationPipe
} from '@metad/server-core'
import { Controller, Get, Header, HttpStatus, Param, Query, Res, Sse, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { from, map } from 'rxjs'
import { Like } from 'typeorm'
import { VolumeClient } from '../sandbox/volume'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'
import { ChatConversationPublicDTO, ChatConversationSimpleDTO } from './dto'
import { BaseMessage, mapChatMessagesToStoredMessages } from '@langchain/core/messages'

@ApiTags('ChatConversation')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ChatConversationController extends CrudController<ChatConversation> {
	constructor(
		private readonly service: ChatConversationService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
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
			...(filter.where ?? {}),
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

	@ApiOperation({ summary: 'Find by id' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found one record' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get(':id')
	async findOneById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations?: PaginationParams<ChatConversation>['relations'],
		@Query('$select', ParseJsonPipe) select?: PaginationParams<ChatConversation>['select'],
		...options: any[]
	): Promise<ChatConversationPublicDTO> {
		return await this.service.findOneDetail(id, { select, relations })
	}

	@Get(':id/state')
	async getThreadState(@Param('id', UUIDValidationPipe) id: string): Promise<any> {
		return await this.service.getThreadState(id)
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
	async getAttachments(@Param('id') id: string) {
		const items = await this.service.getAttachments(id)
		return items.map((_) => new StorageFilePublicDTO(_))
	}

	@Get(':id/files')
	async getFiles(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('deepth') deepth: number,
		@Query('path') path: string
	) {
		const conversation = await this.service.findOne(id)
		const client = new VolumeClient({
			tenantId: conversation.tenantId,
			userId: conversation.createdById
		})

		return await client.list({ path: path || conversation.threadId, deepth })
	}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Get(':id/synthesize')
	@Sse()
	async chat(
		@Res() res: Response,
		@Param('id', UUIDValidationPipe) id: string,
		@Query('message_id') messageId: string,
		@Query('voice') voice: string,
		@Query('language') language: string
	) {
		const abortController = new AbortController()
		res.on('close', () => {
			abortController.abort()
		})
		const observable = from(await this.service.synthesize(id, messageId, { 
			signal: abortController.signal,
			voice, language
		}))

		return observable.pipe(
			map((data) => {
				return {
					data: mapChatMessagesToStoredMessages([data as BaseMessage])[0],
				} as MessageEvent
			}),
			// Add an operator to send a comment event periodically (30s) to keep the connection alive
			keepAlive(30000),
			takeUntilClose(res)
		)
	}
}
