import { IDSSchema, XpertTableStatus } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { DBCreateTableMode, DBTableAction, DBTableDataAction } from '@xpert-ai/plugin-sdk'
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

	async validateTableName(entity: XpertTable): Promise<boolean> {
		if (entity.id) {
			const old = await this.findOneByIdString(entity.id)
			if (old.name === entity.name && old.schema === entity.schema && old.database === entity.database) {
				return true
			}
		}
		try {
			// Get the database adapter
			const adapter = await this.queryBus.execute(
				new XpertDatabaseAdapterQuery({
					id: entity.database
				})
			)
			// Check if table exists in the database
			const exists = await adapter.tableOp(DBTableAction.GET_TABLE_INFO, {
				schema: entity.schema || undefined,
				table: entity.name
			})
			return !exists
		} catch (error) {
			return false
		}
	}

	async upsertTable(entity: XpertTable): Promise<XpertTable> {
		if (!entity.name || !entity.database) {
			throw new BadRequestException(`Table name and database are required for upsert operation.`)
		}
		const isValid = await this.validateTableName(entity)
		if (!isValid) {
			throw new BadRequestException(`Table name ${entity.schema ? entity.schema + '.' : ''}${entity.name} already exists in the database.`)
		}
		let table: XpertTable = null
		if (entity.id) {
			await this.update(entity.id, entity)
			table = await this.findOneByIdString(entity.id)
		} else {
			table = await this.create(entity)
		}

		// Activate the table after upsert
		await this.activateTable(table.id)
		return await this.findOneByIdString(table.id)
	}

	async activateTable(tableId: string) {
		const table = await this.findOneByIdString(tableId)
		if (!table.columns?.length) {
			throw new BadRequestException(`Table must have at least one column to activate.`)
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
			await this.update(table.id, { status: XpertTableStatus.ACTIVE, activatedAt: new Date(), message: null })
		} catch (error) {
			console.error(error)
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

	async insertRow(tableId: string, row: {name: string; value: any; type: string}[]): Promise<void> {
		const table = await this.findOneByIdString(tableId)
		if (table.status !== XpertTableStatus.ACTIVE) {
			throw new BadRequestException(`Table ${table.name} is not active.`)
		}

		try {
			// Get the database adapter
			const adapter = await this.queryBus.execute(
				new XpertDatabaseAdapterQuery({
					id: table.database
				})
			)
			// Create or update physical table in the database
			await adapter.tableDataOp(DBTableDataAction.INSERT, {
				schema: table.schema || undefined,
				table: table.name,
				columns: row.map((column) => ({
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
				})),
				values: row.reduce((acc, column) => {
					acc[column.name] = column.value;
					return acc;
				}, {}),
			})

			// Update table status to ACTIVE
			await this.update(table.id, { status: XpertTableStatus.ACTIVE, activatedAt: new Date(), message: null })
		} catch (error) {
			console.error(error)
			throw error
		}
	}
}
