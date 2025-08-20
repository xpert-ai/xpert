import { Assistant } from '@langchain/langgraph-sdk'
import { IXpert } from '@metad/contracts'
import { ApiKeyAuthGuard, PaginationParams, Public, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Get, Logger, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Xpert } from '../core/entities/internal'
import { XpertService } from '../xpert'

@ApiTags('AI/Assistants')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('assistants')
export class AssistantsController {
	readonly #logger = new Logger(AssistantsController.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly service: XpertService
	) {}

	@Post('search')
	async search(@Body() query: { limit: number; offset: number }) {
		console.log(query)
		const result = await this.service.getMyAll({ take: query.limit, skip: query.offset } as PaginationParams<Xpert>)
		return result.items.map(transformAssistant)
	}

	@Get(':id')
	async getOne(@Param('id') id: string) {
		const item = await this.service.findOne(id)
		return transformAssistant(item)
	}
}

function transformAssistant(xpert: IXpert) {
	return {
		assistant_id: xpert.id,
		name: xpert.name,
		version: Number(xpert.version) || 0,
		created_at: xpert.createdAt.toISOString(),
		updated_at: xpert.updatedAt.toISOString(),
		graph_id: null,
		config: null,
		metadata: {
			avatar: xpert.avatar
		}
	} as Assistant
}
