import { IPagination } from '@xpert-ai/contracts'
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
import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { Like } from 'typeorm'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'
import { ChatConversationPublicDTO, ChatConversationSimpleDTO } from './dto'
import { CancelConversationCommand } from './commands'

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
			...(transformWhere(filter.where ?? {})),
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
	@Get('by-thread')
	async findOneByThreadId(@Query('threadId') threadId: string): Promise<ChatConversationPublicDTO> {
		const conversation = await this.service.findOneByThreadId(threadId)
		return new ChatConversationPublicDTO(conversation)
	}

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

	@Post(':id/cancel')
	async cancelConversation(@Param('id', UUIDValidationPipe) id: string) {
		try {
			return await this.commandBus.execute(new CancelConversationCommand({ conversationId: id }))
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
		return await this.service.getWorkspaceFiles(id, path, deepth)
	}

	@Get(':id/file')
	async getFile(@Param('id', UUIDValidationPipe) id: string, @Query('path') path: string) {
		return await this.service.readWorkspaceFile(id, path)
	}

	@Put(':id/file')
	async saveFile(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() body: { path: string; content: string }
	) {
		return await this.service.saveWorkspaceFile(id, body?.path, body?.content ?? '')
	}

	@Post(':id/file/upload')
	@UseInterceptors(FileInterceptor('file'))
	async uploadFile(
		@Param('id', UUIDValidationPipe) id: string,
		@Body('path') path: string,
		@UploadedFile() file: Express.Multer.File
	) {
		return await this.service.uploadWorkspaceFile(id, path, file)
	}

	@Delete(':id/file')
	async deleteFile(@Param('id', UUIDValidationPipe) id: string, @Query('path') path: string) {
		return await this.service.deleteWorkspaceFile(id, path)
	}
}
