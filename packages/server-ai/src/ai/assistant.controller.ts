import { Assistant } from '@langchain/langgraph-sdk'
import { IXpert } from '@metad/contracts'
import { ApiKeyOrClientSecretAuthGuard, PaginationParams, Public, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Get, Logger, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { isNil, omitBy, pick } from 'lodash-es'
import { Xpert } from '../core/entities/internal'
import { XpertService } from '../xpert'

@ApiTags('AI/Assistants')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
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
	async search(@Body() query: { limit: number; offset: number; graph_id?: string; metadata?: any }) {
		this.#logger.log(`Search Assistants: ${JSON.stringify(query)}`)
		const result = await this.service.getMyAll({
			where: transformMetadata2Where(query.metadata),
			take: query.limit,
			skip: query.offset
		} as PaginationParams<Xpert>)
		return result.items.map(transformAssistant)
	}

	@Post('count')
	async count(@Body() body: { graph_id?: string; metadata?: any }) {
		this.#logger.log(`Count Assistants: ${JSON.stringify(body)}`)
		const where = transformMetadata2Where(body?.metadata)
		if (body?.graph_id) {
			where['id'] = body.graph_id
		}
		return this.service.countMy(where)
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
		graph_id: xpert.id,
		name: xpert.name,
		description: xpert.description,
		version: Number(xpert.version) || 0,
		created_at: xpert.createdAt.toISOString(),
		updated_at: xpert.updatedAt.toISOString(),
		config: omitBy(pick(xpert, 'agentConfig', 'options', 'summarize', 'memory', 'features'), isNil),
		metadata: omitBy({
			workspaceId: xpert.workspaceId,
			avatar: xpert.avatar,
			slug: xpert.slug,
			type: xpert.type,
			tags: xpert.tags?.length ? xpert.tags : undefined,
		}, isNil),
		context: null
	} as Assistant
}

function transformMetadata2Where(metadata: any) {
	const where = {}
	if (metadata?.slug) {
		where['slug'] = metadata.slug
	}
	if (metadata?.workspaceId) {
		where['workspaceId'] = metadata.workspaceId
	}
	if (metadata?.type) {
		where['type'] = metadata.type
	}
	return where
}
