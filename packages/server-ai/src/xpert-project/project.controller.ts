import { IXpertProject, IXpertToolset, OrderTypeEnum } from '@metad/contracts'
import { CrudController, PaginationParams, ParseJsonPipe, TransformInterceptor } from '@metad/server-core'
import { Controller, Delete, Get, Logger, Param, Put, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { FindChatConversationQuery } from '../chat-conversation'
import { ChatConversationPublicDTO } from '../chat-conversation/dto'
import { XpertProject } from './entities/project.entity'
import { XpertProjectService } from './project.service'

@ApiTags('XpertProject')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertProjectController extends CrudController<XpertProject> {
	readonly #logger = new Logger(XpertProjectController.name)
	constructor(
		private readonly service: XpertProjectService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@Get(':id/xperts')
	async getXperts(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IXpertProject>) {
		return this.service.getXperts(id, params)
	}

	@Put(':id/xperts/:xpert')
	async updateXperts(@Param('id') id: string, @Param('xpert') xpertId: string) {
		return this.service.addXpert(id, xpertId)
	}

	@Delete(':id/xperts/:xpert')
	async removeXpert(@Param('id') id: string, @Param('xpert') xpertId: string) {
		return this.service.removeXpert(id, xpertId)
	}

	@Get(':id/conversations')
	async getConversations(@Param('id') id: string) {
		const { items, total } = await this.queryBus.execute(
			new FindChatConversationQuery(
				{ projectId: id },
				{ relations: ['createdBy'], order: { updatedAt: OrderTypeEnum.DESC } }
			)
		)
		return {
			items: items.map((_) => new ChatConversationPublicDTO(_)),
			total
		}
	}

	@Get(':id/toolsets')
	async getToolsets(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IXpertToolset>) {
		return this.service.getToolsets(id, params)
	}

	@Put(':id/toolsets/:toolset')
	async updateToolsets(@Param('id') id: string, @Param('toolset') toolsetId: string) {
		return this.service.addToolset(id, toolsetId)
	}
	
	@Delete(':id/toolsets/:toolset')
	async removeToolset(@Param('id') id: string, @Param('toolset') toolsetId: string) {
		return this.service.removeToolset(id, toolsetId)
	}
}
