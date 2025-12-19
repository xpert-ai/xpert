import { BaseStore } from '@langchain/langgraph'
import { ICopilotModel } from '@metad/contracts'
import { ApiKeyOrClientSecretAuthGuard, Public, RequestContext, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Delete, Get, Logger, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CreateMemoryStoreCommand } from '../shared/commands'
import { XpertService } from '../xpert'

@ApiTags('AI/Store')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('store')
export class StoreController {
	readonly #logger = new Logger(StoreController.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly service: XpertService
	) {}

	@Get('items')
	async findAll(
		@Query('namespace') namespace: string,
		@Query('key') key: string,
		@Query('refreshTtl') refreshTtl: boolean | null
	) {
		const namespaces = namespace.split('.')
		const store = await this.createStore(namespaces)
		const item = await store.get(namespaces, key)
		return item
	}

	@Put('items')
	async putItem(@Body() body: {namespace: string[]; key: string; value: any; }) {
		const store = await this.createStore(body.namespace)
		await store.put(body.namespace, body.key, body.value)
		return { success: true }
	}

	@Delete('items')
	async deleteItem(@Body() body: {namespace: string[]; key: string}) {
		const store = await this.createStore(body.namespace)
		await store.delete(body.namespace, body.key)
		return { success: true }
	}

	@Post('namespaces')
	async namespaces(@Body() query: { prefix: string[]; max_depth: number; limit: number; offset: number }) {
		const store = await this.createStore(query.prefix)
		const namespaces = await store.listNamespaces({
			prefix: query.prefix,
			maxDepth: query.max_depth,
			limit: query.limit,
			offset: query.offset
		})
		return { namespaces }
	}

	@Post('items/search')
	async search(
		@Body()
		body: {
			namespace_prefix: string[]
			filter?: Record<string, unknown>
			limit?: number
			offset?: number
			query?: string
			refreshTtl?: boolean | null
		}
	) {
		const store = await this.createStore(body.namespace_prefix)
		const items = await store.search(body.namespace_prefix, body)
		return { items }
	}

	async createStore(namespace: string[]) {
		let copilotModel: ICopilotModel = null
		// Assume that the first element of namespace is xpertId
		if (namespace?.[0]) {
			try {
				const xpert = await this.service.findOne(namespace[0])
				copilotModel = xpert.memory?.copilotModel
			} catch (error) {
				//
			}
		}
		return await this.commandBus.execute<CreateMemoryStoreCommand, BaseStore>(
			new CreateMemoryStoreCommand(
				RequestContext.currentTenantId(),
				RequestContext.getOrganizationId(),
				copilotModel,
				{}
			)
		)
	}
}
