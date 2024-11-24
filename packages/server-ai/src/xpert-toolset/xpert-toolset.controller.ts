import { IPagination, IXpertTool, IXpertToolset } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	Public,
	RequestContext,
	TransformInterceptor
} from '@metad/server-core'
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
	Inject
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ServerResponse } from 'http'
import { TestOpenAPICommand } from '../xpert-tool/commands/'
import { ParserODataSchemaCommand, ParserOpenAPISchemaCommand } from './commands/'
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
import { ConfigService } from '@metad/server-config'


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
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@Get('by-workspace/:id')
	async getAllByWorkspace(
		@Param('id') workspaceId: string,
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

	@Get('providers')
	async getAllToolProviders() {
		return this.queryBus.execute(new ListBuiltinToolProvidersQuery()).then((items) =>
			items.map((schema) =>
					new ToolProviderDTO({
						...schema.identity
					}, this.baseUrl)
			)
		)
	}
	
	@Post('provider/openapi/remote')
	async getOpenAPISchema(@Body() body: {url: string; credentials: Record<string, string>}) {
		return this.queryBus.execute(new GetOpenAPIRemoteSchemaQuery(body.url, body.credentials))
	}

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
	@Get('builtin-provider/:name/icon')
	async getProviderIcon(@Param('name') provider: string, @Res() res: ServerResponse) {
		const [icon, mimetype] = await this.queryBus.execute(new ToolProviderIconQuery(provider))

		if (!icon) {
			throw new HttpException('Icon not found', HttpStatus.NOT_FOUND)
		}

		res.setHeader('Content-Type', mimetype)
		res.end(icon)
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
		return await this.service.createBuiltinToolset(provider, body)
	}

	@Post('provider/odata/remote')
	async getODataMetadata(@Body() body: {url: string; credentials: Record<string, string>}) {
		return await this.queryBus.execute(new GetODataRemoteMetadataQuery(body.url, body.credentials))
	}

	@Post('provider/odata/schema')
	async parseODataSchema(@Body() { schema }: { schema: string }) {
		return this.commandBus.execute(new ParserODataSchemaCommand(schema))
	}
}
