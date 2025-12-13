import { RunnableLambda } from '@langchain/core/runnables'
import { getErrorMessage, keepAlive, takeUntilClose } from '@metad/server-common'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, IPagination, IXpertTool, IXpertToolset, TAvatar } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	Public,
	RequestContext,
	TransformInterceptor,
	UUIDValidationPipe
} from '@metad/server-core'
import { ConfigService } from '@metad/server-config'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
	Body,
	Controller,
	Get,
	HttpException,
	HttpStatus,
	Logger,
	Param,
	Post,
	Query,
	Res,
	UseInterceptors,
	Inject,
	UseGuards,
	InternalServerErrorException,
	Header,
	Sse
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Cache } from 'cache-manager'
import { Response } from 'express'
import { ServerResponse } from 'http'
import { Observable } from 'rxjs'
import { TestOpenAPICommand } from '../xpert-tool/commands/'
import { MCPToolsBySchemaCommand, ParserODataSchemaCommand, ParserOpenAPISchemaCommand } from './commands/'
import { ToolProviderDTO, ToolsetPublicDTO } from './dto'
import {
	GetODataRemoteMetadataQuery,
	GetOpenAPIRemoteSchemaQuery,
	ListBuiltinCredentialsSchemaQuery,
	ListBuiltinToolProvidersQuery,
	ListBuiltinToolsQuery,
	ToolProviderIconQuery
} from './queries'
import { XpertToolset } from './xpert-toolset.entity'
import { XpertToolsetService } from './xpert-toolset.service'
import { ToolProviderNotFoundError } from './errors'
import { ToolsetGuard } from './guards/toolset.guard'
import { WorkspaceGuard } from '../xpert-workspace'


@ApiTags('XpertToolset')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertToolsetController extends CrudController<XpertToolset> {
	readonly #logger = new Logger(XpertToolsetController.name)

	@Inject(ConfigService)
	private readonly configService: ConfigService

	get baseUrl() {
		return this.configService.get('baseUrl') as string
	}
	
	constructor(
		private readonly service: XpertToolsetService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {
		super(service)
	}

	@UseGuards(WorkspaceGuard)
	@Get('by-workspace/:workspaceId')
	async getAllByWorkspace(
		@Param('workspaceId') workspaceId: string,
		@Query('data', ParseJsonPipe) data: PaginationParams<XpertToolset>,
		@Query('published') published?: boolean
	) {
		const result = await this.service.getAllByWorkspace(workspaceId, data, published, RequestContext.currentUser())
		const items = await this.service.afterLoad(result.items)
		return {
			...result,
			items: items.map((item) => new ToolsetPublicDTO(item))
		}
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found records'
	})
	@Get()
	async findAllTools(
		@Query('data', ParseJsonPipe) options?: PaginationParams<XpertToolset>
	): Promise<IPagination<ToolsetPublicDTO>> {
		const { items, ...rest } = await this.service.findAll(options)
		const _items = await this.service.afterLoad(items)
		return {
			items: _items.map((item) => new ToolsetPublicDTO(item)),
			...rest
		}
	}

	@Get('tags')
	async getAllTags() {
		return this.service.getAllTags()
	}

	/**
	 * Get all available toolset providers
	 * 
	 * @returns 
	 */
	@Get('providers')
	async getAllToolProviders() {
		const items = await this.queryBus.execute(new ListBuiltinToolProvidersQuery())
		return items.map((schema) =>
					new ToolProviderDTO({
						...schema.identity
					}, this.baseUrl)
				)
	}
	
	@Post('provider/openapi/remote')
	async getOpenAPISchema(@Body() body: {url: string; credentials: Record<string, string>}) {
		return this.queryBus.execute(new GetOpenAPIRemoteSchemaQuery(body.url, body.credentials))
	}

	/**
	 * Convert OpenAPI Schema to Tool's JSON Schema
	 * 
	 * @param param0 { schema: Schema of OpenAPI }
	 * @returns 
	 */
	@Post('provider/openapi/schema')
	async parseOpenAPISchema(@Body() { schema }: { schema: string }) {
		return this.commandBus.execute(new ParserOpenAPISchemaCommand(schema))
	}

	@Post('provider/openapi/test')
	async testOpenAPI(@Body() tool: IXpertTool) {
		return this.commandBus.execute(new TestOpenAPICommand(tool))
	}

	@Get('provider/:name')
	async getToolProvider(@Param('name') provider: string) {
		const providers = await this.queryBus.execute(new ListBuiltinToolProvidersQuery([provider]))
		if (!providers[0]) {
			throw new ToolProviderNotFoundError(`Tool provider '${provider}' not found!`)
		}

		return new ToolProviderDTO({
			...providers[0].identity
		}, this.baseUrl)
	}

	@Public()
	@Get(':id/avatar')
	async getMCPAvatar(@Param('id', UUIDValidationPipe) id: string) {
		const cacheKey = `toolset:avatar:${id}`
		const cache = await this.cacheManager.get<{avatar: TAvatar}>(cacheKey)
		if (!cache) {
			const toolset = await this.service.findOne(id)
			await this.cacheManager.set(cacheKey, {avatar: toolset.avatar}, 5 * 60 * 1000) // Cache for 5 minutes
			return toolset.avatar
		}
		return cache.avatar
	}

	@Public()
	@Get('builtin-provider/:name/icon')
	async getProviderIcon(@Param('name') provider: string, @Query('org') org: string, @Res() res: ServerResponse) {
		const [icon, mimetype] = await this.queryBus.execute(new ToolProviderIconQuery({organizationId: org, provider}))
		if (icon) {
			res.setHeader('Content-Type', mimetype)
			res.end(icon)
			return
		}
		throw new HttpException('Icon not found', HttpStatus.NOT_FOUND)
	}

	@Get('builtin-provider/:name/tools')
	async getBuiltinTools(@Param('name') provider: string) {
		return this.queryBus.execute(new ListBuiltinToolsQuery(provider))
	}

	@Get('builtin-provider/:name/credentials-schema')
	async getBuiltinCredentialsSchema(@Param('name') provider: string) {
		return this.queryBus.execute(new ListBuiltinCredentialsSchemaQuery(provider))
	}

	@Post('builtin-provider/:name/instance')
	async createBuiltinInstance(@Param('name') provider: string, @Body() body: Partial<IXpertToolset>) {
		try {
			return await this.service.createBuiltinToolset(provider, body)
		} catch(err) {
			throw new InternalServerErrorException(err.message)
		}
	}

	@Post('provider/odata/remote')
	async getODataMetadata(@Body() body: {url: string; credentials: Record<string, string>}) {
		return await this.queryBus.execute(new GetODataRemoteMetadataQuery(body.url, body.credentials))
	}

	@Post('provider/odata/schema')
	async parseODataSchema(@Body() { schema }: { schema: string }) {
		return this.commandBus.execute(new ParserODataSchemaCommand(schema))
	}

	/**
	 * @Post @Sse There is a priority order.
	 */
	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Post('provider/mcp/tools')
	@Sse()
	getMCPTools(@Res() res: Response, @Body() toolset: Partial<IXpertToolset>) {
		return new Observable<MessageEvent>((subscriber) => {
			RunnableLambda.from(async (toolset: Partial<IXpertToolset>) => {
				try {
					const result = await this.commandBus.execute(new MCPToolsBySchemaCommand(toolset))
					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.MESSAGE,
							data: result
						}
					} as MessageEvent)
					subscriber.complete()
				} catch(err) {
					this.#logger.error(err)
					subscriber.error(err)
				}
			}).invoke(toolset, {
				callbacks: [
					{
						handleCustomEvent(eventName, data, runId) {
							if (eventName === ChatMessageEventTypeEnum.ON_CHAT_EVENT) {
								subscriber.next({
									data: {
										type: ChatMessageTypeEnum.EVENT,
										data: data
									}
								} as MessageEvent)
							} else {
								this.#logger.warn(`Unprocessed custom event in xpert agent: ${eventName} ${runId}`)
							}
						},
					},
				],
			}).catch((err) => {
				console.error(err)
				subscriber.error(getErrorMessage(err))
			})
		}).pipe(
			// Add an operator to send a comment event periodically (30s) to keep the connection alive
			keepAlive(30000),
			takeUntilClose(res)
		)
	}

	// Single Toolset
	@Get(':toolsetId/tools')
	async getToolsetTools(@Param('toolsetId') toolsetId: string,) {
		const toolset = await this.service.findOne(toolsetId, { relations: ['tools'] })
		return toolset.tools
	}

	@UseGuards(ToolsetGuard)
	@Get(':id/credentials')
	async getCredentials(@Param('id') toolsetId: string,) {
		const toolset = await this.service.findOne(toolsetId)
		return toolset.credentials
	}
}
