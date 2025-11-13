import { IDSSchema, XpertTableStatus } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { DBCreateTableMode, DBTableAction } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { XpertDatabaseAdapterQuery } from './queries/get-database-adapter.query'
import { XpertTable } from './xpert-table.entity'

@Injectable()
export class XpertTableService extends TenantOrganizationAwareCrudService<XpertTable> {
	readonly #logger = new Logger(XpertTableService.name)

	constructor(
		@InjectRepository(XpertTable)
		repository: Repository<XpertTable>,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async upsertTable(entity: XpertTable): Promise<XpertTable> {
		let table: XpertTable = null
		if (entity.id) {
			await this.update(entity.id, entity)
			table = await this.findOneByIdString(entity.id)
		} else {
			table = await this.create(entity)
		}

		// Activate the table after upsert
		await this.activateTable(table.id)
		return await this.findOneByIdString(entity.id)
	}

	async activateTable(tableId: string) {
		const table = await this.findOneByIdString(tableId)
		if (!table) {
			throw new BadRequestException(`Xpert Table with ID ${tableId} not found`)
		}

		await this.update(table.id, { status: XpertTableStatus.PENDING_ACTIVATION })
		try {
			// Get the database adapter
			const adapter = await this.queryBus.execute(
				new XpertDatabaseAdapterQuery({
					id: table.database
				})
			)
			// Create or update physical table in the database
			await adapter.tableOp(DBTableAction.CREATE_TABLE, {
				schema: table.schema || undefined,
				table: table.name,
				columns: table.columns.map((column) => ({
					/**
					 * Key of data object
					 */
					name: column.name,
					/**
					 * Name of table column
					 */
					fieldName: column.name,
					/**
					 * Object value type, convert to db type
					 */
					type: column.type,
					/**
					 * Is primary key column
					 */
					isKey: false,
					/**
					 * length of type for column: varchar, decimal ...
					 */
					length: undefined,
					/**
					 * fraction of type for decimal
					 */
					fraction: undefined
				})),
				createMode: DBCreateTableMode.UPGRADE
			})

			// Update table status to ACTIVE
			await this.update(table.id, { status: XpertTableStatus.ACTIVE })
		} catch (error) {
			console.log('Error creating/updating physical table:', error)
			await this.update(table.id, { status: XpertTableStatus.ERROR, message: getErrorMessage(error) })
		}
	}

	async getDatabaseSchemas(databaseId: string): Promise<IDSSchema[]> {
		try {
			const adapter = await this.queryBus.execute(
				new XpertDatabaseAdapterQuery({
					id: databaseId
				})
			)
			return await adapter.getCatalogs()
		} catch (error) {
			console.error(error)
			throw new BadRequestException(`Error getting database schemas: ${getErrorMessage(error)}`)
		}
	}
}
