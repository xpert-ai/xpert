import { AnalyticsPermissionsEnum, IDSSchema, IDSTable, IDataSource, IPagination, IUser } from '@metad/contracts'
import {
	CrudController,
	CurrentUser,
	EmployeeId,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	UseValidationPipe,
	UUIDValidationPipe
} from '@metad/server-core'
import {
	Body,
	ClassSerializerInterceptor,
	Controller,
	Delete,
	Get,
	Headers,
	HttpCode,
	HttpException,
	HttpStatus,
	Param,
	Post,
	Put,
	Query,
	UploadedFile,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, EventBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { FindOneOptions } from 'typeorm'
import { DataSourceAuthentication } from './authentication/authentication.entity'
import { DataLoadCommand } from './commands'
import { DataSource } from './data-source.entity'
import { DataSourceService } from './data-source.service'
import { DataSourcePublicDTO } from './dto'
import { DataSourceUpdatedEvent } from './events'

@ApiTags('DataSource')
@ApiBearerAuth()
@Permissions(AnalyticsPermissionsEnum.DATA_SOURCE_EDIT)
@Controller()
export class DataSourceController extends CrudController<DataSource> {
	constructor(
		private readonly dsService: DataSourceService,
		private readonly commandBus: CommandBus,
		private readonly eventBus: EventBus
	) {
		super(dsService)
	}

	@ApiOperation({ summary: 'Find all dataSources within the tenant.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found dataSources',
		type: DataSource
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseInterceptors(ClassSerializerInterceptor)
	@UseGuards(PermissionGuard)
	@Permissions(AnalyticsPermissionsEnum.DATA_SOURCE_VIEW)
	@Get()
	@UseValidationPipe({ transform: true })
	async findAlls(
		@Query('$query', ParseJsonPipe) data: any,
		@CurrentUser() user: IUser,
		@EmployeeId() employeeId: string
	): Promise<IPagination<DataSourcePublicDTO>> {
		const { select, relations, order, findInput } = data
		const dataSources = await this.dsService.findAll({
			select,
			where: findInput,
			relations,
			order
		})

		return {
			...dataSources,
			items: dataSources.items.map((item) => new DataSourcePublicDTO(item))
		}
	}

	@Get('sql-select-options')
	@UseInterceptors(ClassSerializerInterceptor)
	async getSqlDataSources() {
		const { items } = await this.dsService.findSqlDataSources()
		return items.map((item) => ({
			value: item.id,
			label: item.name
		}))
	}

	@Get('sql-schema-select-options')
	@UseInterceptors(ClassSerializerInterceptor)
	async getSqlSchemas(@Query('dataSource') dataSource: string,) {
		if (!dataSource) {
			return []
		}
		const items = await this.dsService.getCatalogs(dataSource)
		return items.map((item) => ({
			value: item.name,
			label: item.label || item.name
		}))
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
	async findById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<DataSource>['relations'],
		@Query('$query', ParseJsonPipe) options: FindOneOptions<DataSource>
	): Promise<DataSource> {
		return this.dsService.findOne(id, {relations, ...options})
	}

	@Put(':id')
	async updateOne(@Param('id', UUIDValidationPipe) id: string, @Body() entity: Partial<DataSource>): Promise<void> {
		await this.dsService.update(id, entity)
		/**
		 * @todo Updated cqrs event 应该在哪里发出 ?
		 */
		this.eventBus.publish(new DataSourceUpdatedEvent(id))
	}

	@Get('/:id/catalogs')
	async getCatalogs(@Param('id', UUIDValidationPipe) dataSourceId: string): Promise<IDSSchema[]> {
		try {
			return await this.dsService.getCatalogs(dataSourceId)
		} catch (error) {
			throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}

	@Get('/:id/schema')
	async getSchema(
		@Param('id', UUIDValidationPipe) dataSourceId: string,
		@Query('catalog') catalog: string,
		@Query('table') table: string,
		@Query('statement') statement: string
	): Promise<IDSTable[]> {
		try {
			return await this.dsService.getSchema(dataSourceId, catalog, table, statement)
		} catch (error) {
			throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}

	@Post('/:id/query')
	async query(
		@Param('id', UUIDValidationPipe) dataSourceId: string,
		@Body() body: { query: string },
		@Headers('Accept-Language') acceptLanguage: string
	): Promise<any> {
		return await this.dsService
			.query(dataSourceId, body?.query, {
				headers: { 'Accept-Language': acceptLanguage }
			})
			.catch((err) => {
				throw new HttpException(err.message, HttpStatus.BAD_REQUEST)
			})
	}

	@Post('/:id/olap')
	@HttpCode(200)
	async olap(
		@Param('id', UUIDValidationPipe) dataSourceId: string,
		@Body() body: { query: { id: string; body: string }[] },
		@Headers('Accept-Language') acceptLanguage: string
	): Promise<any> {
		const dataSource = await this.dsService.findOne(dataSourceId, {
			relations: ['type']
		})

		return Promise.all(
			body.query?.map(({ id, body }) => {
				return this.dsService
					.olap(dataSource, body, acceptLanguage)
					.then((data) => {
						return {
							id,
							status: 200,
							data
						}
					})
					.catch(({ response }) => {
						return {
							id,
							status: response.status,
							statusText: response.statusText,
							data: response.data
						}
					})
			})
		)
	}

	@Post('/ping')
	async ping(@Body() body: IDataSource): Promise<void> {
		try {
			return await this.dsService.ping(body)
		} catch (err) {
			throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}

	@Post('/:id/ping')
	async pingDataSource(
		@Param('id', UUIDValidationPipe) dataSourceId: string,
		@Body() body: IDataSource
	): Promise<void> {
		try {
			return await this.dsService.ping(dataSourceId, body)
		} catch (err) {
			throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}

	@Get('/:id/authentication')
	async getAuthentication(@Param('id', UUIDValidationPipe) dataSourceId: string) {
		return this.dsService.getMyAuthentication(dataSourceId)
	}

	@Post('/:id/authentication')
	async authenticate(@Param('id', UUIDValidationPipe) dataSourceId: string, @Body() body: DataSourceAuthentication) {
		return this.dsService.createAuthentication(dataSourceId, body)
	}

	@Delete('/:id/authentication')
	async deleteAuthentication(@Param('id', UUIDValidationPipe) dataSourceId: string) {
		return this.dsService.deleteAuthentication(dataSourceId)
	}

	@Post('/:id/load')
	@UseInterceptors(FileInterceptor('file'))
	async load(
		@UploadedFile() file: Express.Multer.File,
		@Param('id', UUIDValidationPipe) dataSourceId: string,
		@Body()
		body: {
			params: string
		}
	) {
		try {
			return this.commandBus.execute(
				new DataLoadCommand({
					id: dataSourceId,
					sheets: JSON.parse(body.params),
					file: file
				})
			)
		} catch (error) {
			throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}
}
