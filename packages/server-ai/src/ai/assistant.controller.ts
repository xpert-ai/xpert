import { Assistant } from '@langchain/langgraph-sdk'
import { ICopilotModel, IXpert, ModelPropertyKey } from '@metad/contracts'
import { ApiKeyOrClientSecretAuthGuard, PaginationParams, Public, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Get, Logger, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { normalizeContextSize } from '@xpert-ai/plugin-sdk'
import { isNil, omitBy, pick } from 'lodash-es'
import { In } from 'typeorm'
import { Xpert } from '../core/entities/internal'
import { XpertService } from '../xpert'

const ASSISTANT_RELATIONS = ['agent', 'agent.copilotModel', 'copilotModel']

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

		const ids = result.items?.map((item) => item.id).filter(Boolean) ?? []
		if (!ids.length) {
			return []
		}

		const assistants = await this.loadAssistantsByIds(ids)
		return assistants.map(transformAssistant)
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
		const item = await this.service.findOne(id, {
			relations: ASSISTANT_RELATIONS
		})
		return transformAssistant(item)
	}

	private async loadAssistantsByIds(ids: string[]): Promise<IXpert[]> {
		const assistants = await this.service.repository.find({
			where: {
				id: In(ids)
			},
			relations: ASSISTANT_RELATIONS
		})
		const byId = new Map(assistants.map((item) => [item.id, item]))

		return ids.map((id) => byId.get(id)).filter((item): item is Xpert => !!item)
	}
}

function transformAssistant(xpert: IXpert) {
	const contextSize = getAssistantContextSize(xpert)
	const agentKey = getAssistantPrimaryAgentKey(xpert)
	const configurable = omitBy(
		{
			context_size: contextSize,
			agentKey
		},
		isNil
	)
	const config = omitBy(
		{
			...pick(xpert, 'agentConfig', 'options', 'summarize', 'memory', 'features'),
			configurable: Object.keys(configurable).length ? configurable : undefined
		},
		isNil
	)

	return {
		assistant_id: xpert.id,
		graph_id: xpert.id,
		name: xpert.name,
		description: xpert.description,
		version: Number(xpert.version) || 0,
		created_at: xpert.createdAt.toISOString(),
		updated_at: xpert.updatedAt.toISOString(),
		config,
		metadata: omitBy(
			{
				workspaceId: xpert.workspaceId,
				avatar: xpert.avatar,
				slug: xpert.slug,
				type: xpert.type,
				title: xpert.title,
				tags: xpert.tags?.length ? xpert.tags : undefined,
				context_size: contextSize,
				agent_key: agentKey
			},
			isNil
		),
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

function getAssistantContextSize(xpert: IXpert): number | undefined {
	const effectiveCopilotModel = (xpert.agent?.copilotModel ?? xpert.copilotModel) as ICopilotModel
	return normalizeContextSize(effectiveCopilotModel?.options?.[ModelPropertyKey.CONTEXT_SIZE])
}

function getAssistantPrimaryAgentKey(xpert: IXpert): string | undefined {
	const key = xpert?.agent?.key
	if (typeof key !== 'string') {
		return
	}
	const normalized = key.trim()
	return normalized || undefined
}
