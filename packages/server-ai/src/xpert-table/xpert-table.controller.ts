import { IXpertTable } from '@metad/contracts'
import { CrudController, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Get, Logger, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiTags } from '@nestjs/swagger'
import { XpertDatabasesQuery } from './queries/get-databases.query'
import { XpertTable } from './xpert-table.entity'
import { XpertTableService } from './xpert-table.service'

@ApiTags('XpertTable')
@UseInterceptors(TransformInterceptor)
@Controller('xpert-table')
export class XpertTableController extends CrudController<XpertTable> {
	readonly #logger = new Logger(XpertTableController.name)
	constructor(
		private readonly service: XpertTableService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@Post()
	async saveAndActivate(@Body() entity: IXpertTable) {
		return this.service.upsertTable(entity)
	}

	@Get('databases')
	async getDatabases() {
		this.#logger.log('Get Xpert Databases')
		return this.queryBus.execute(new XpertDatabasesQuery({ protocol: 'sql' }))
	}

	@Get('schemas')
	async getDatabaseSchemas(@Query('databaseId') databaseId: string) {
		return this.service.getDatabaseSchemas(databaseId)
	}

	@Post(':id/activate')
	async activateTable(@Param('id') tableId: string) {
		return this.service.activateTable(tableId)
	}
}
