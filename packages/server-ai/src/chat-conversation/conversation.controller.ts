import { IPagination } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	RequestContext,
	TransformInterceptor,
	UUIDValidationPipe
} from '@metad/server-core'
import { Controller, Get, HttpStatus, Param, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'
import { ChatConversationPublicDTO, ChatConversationSimpleDTO } from './dto'

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
	async findMyAll(
		@Query('data', ParseJsonPipe) filter?: PaginationParams<ChatConversation>,
		...options: any[]
	): Promise<IPagination<ChatConversation>> {
		return this.service.findAll({ ...filter, where: {
				...(filter.where ?? {}),
				createdById: RequestContext.currentUserId()
			}
		})
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
}
