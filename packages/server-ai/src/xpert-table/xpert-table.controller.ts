import { IXpertTable } from '@metad/contracts'
import { CrudController, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
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

	/**
	 * 创建或更新表并自动激活（覆盖基类POST方法）
	 * Create or update table and auto activate (override base POST method)
	 */
	@Post()
	async create(@Body() entity: IXpertTable) {
		return this.service.upsertTable(entity as any)
	}

	/**
	 * 更新表并同步物理表（覆盖基类PUT方法）
	 * Update table and sync physical table (override base PUT method)
	 */
	@Put(':id')
	async update(@Param('id') id: string, @Body() entity: IXpertTable) {
		return this.service.upsertTable({ ...entity, id } as any)
	}

	@Get('databases')
	async getDatabases() {
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

	/**
	 * 删除表记录和物理表
	 * Delete table record and physical table
	 */
	@ApiOperation({ summary: 'Delete table record and physical table' })
	@ApiResponse({
		status: HttpStatus.NO_CONTENT,
		description: 'The table has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Table not found'
	})
	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(':id')
	async deleteTable(@Param('id') tableId: string) {
		return this.service.deleteTable(tableId)
	}
}
