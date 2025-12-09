import { IDSSchema, IXpertTable, XpertTableStatus } from '@metad/contracts'
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

	/**
	 * Validate if table name is available
	 * - If updating existing table and name unchanged, return true
	 * - If creating new table or renaming, check if physical table exists
	 */
	async validateTableName(entity: XpertTable): Promise<boolean> {
		// If it's an update operation
		if (entity.id) {
			const old = await this.findOneByIdString(entity.id)
			if (!old) {
				// Table not found, treat as new table
				this.#logger.warn(`Table with id ${entity.id} not found, treating as new table`)
			} else {
				// If name, schema, database unchanged, return true (allow updating columns)
				if (old.name === entity.name && old.schema === entity.schema && old.database === entity.database) {
					return true
				}
				// If name changed but it's the same table (same id), check if new name conflicts with other tables
				// This allows renaming the table
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
			
			// If table exists in database, check if it's the same table we're updating
			if (exists && entity.id) {
				// For update operations, if table exists in database, it might be the same table
				// Check if there's a logical table record with the same name, schema, database
				const existingTable = await this.repository.findOne({
					where: {
						name: entity.name,
						schema: entity.schema || null,
						database: entity.database
					}
				})
				// If the existing table is the same one we're updating, allow it
				if (existingTable && existingTable.id === entity.id) {
					return true
				}
			}
			
			return !exists
		} catch (error) {
			this.#logger.error(`Error validating table name: ${getErrorMessage(error)}`)
			// If it's an update operation and validation fails, allow it (might be network issue)
			// For new tables, fail validation
			return !entity.id
		}
	}

	async upsertTable(entity: IXpertTable): Promise<XpertTable> {
		this.#logger.log(`Starting upsertTable for: ${entity.name}, isUpdate: ${!!entity.id}`)
		
		if (!entity.name || !entity.database) {
			throw new BadRequestException(`Table name and database are required for upsert operation.`)
		}
		
		// Validate table name (only check when creating new or renaming)
		const isValid = await this.validateTableName(entity)
		if (!isValid) {
			throw new BadRequestException(
				`Table name ${entity.schema ? entity.schema + '.' : ''}${entity.name} already exists in the database.`
			)
		}
		
		let table: XpertTable = null
		const isNewTable = !entity.id
		if (entity.id) {
			// Check if table name changed, need to rename physical table if changed
			const old = await this.findOneByIdString(entity.id)
			if (old.name !== entity.name && old.status === XpertTableStatus.ACTIVE) {
				try {
					const adapter = await this.queryBus.execute(
						new XpertDatabaseAdapterQuery({
							id: old.database
						})
					)
					// Rename physical table
					await adapter.tableOp(DBTableAction.RENAME_TABLE, {
						schema: old.schema || undefined,
						table: old.name,
						newTable: entity.name
					})
					this.#logger.log(`Physical table renamed from ${old.name} to ${entity.name}`)
				} catch (error) {
					this.#logger.error(`Error renaming physical table: ${getErrorMessage(error)}`)
					throw new BadRequestException(`Failed to rename physical table: ${getErrorMessage(error)}`)
				}
			}
			
			await this.update(entity.id, entity)
			table = await this.findOneByIdString(entity.id)
		} else {
			table = await this.create(entity)
		}

		// Activate the table to sync physical table structure
		try {
			this.#logger.log(`Activating table ${table.name} (id: ${table.id})`)
			await this.activateTable(table.id)
			this.#logger.log(`Table ${table.name} upserted successfully`)
			return await this.findOneByIdString(table.id)
		} catch (activationError) {
			this.#logger.error(`Table activation failed for ${table.name}: ${getErrorMessage(activationError)}`)
			
			// If activation fails for newly created table, delete the logical table to avoid inconsistency
			if (isNewTable) {
				this.#logger.error(`Deleting newly created logical table ${table.name} due to activation failure`)
				try {
					await this.delete(table.id)
					this.#logger.log(`Logical table ${table.name} deleted successfully`)
				} catch (deleteError) {
					this.#logger.error(`Failed to delete logical table ${table.name}: ${getErrorMessage(deleteError)}`)
					// Even if deletion fails, throw the original activation error
				}
			} else {
				// Update error status for existing table
				try {
					await this.update(table.id, { 
						status: XpertTableStatus.ERROR, 
						message: getErrorMessage(activationError) 
					})
					this.#logger.log(`Table ${table.name} status updated to ERROR`)
				} catch (updateError) {
					this.#logger.error(`Failed to update table status: ${getErrorMessage(updateError)}`)
				}
			}
			
			// Re-throw activation error to ensure frontend receives error response
			// Ensure error is properly formatted as HTTP exception
			if (activationError instanceof BadRequestException) {
				throw activationError
			} else {
				throw new BadRequestException(`Table activation failed: ${getErrorMessage(activationError)}`)
			}
		}
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
			
			// Clean and prepare column definitions
			const cleanedColumns = table.columns.map((column) => {
				const col = column as any  // Type assertion to access newly added properties
				
				// Clean default value: treat empty string as no default
				let defaultValue = col.defaultValue
				if (defaultValue && typeof defaultValue === 'string' && !defaultValue.trim()) {
					defaultValue = undefined
				}
				
				return {
					name: column.name,
					fieldName: column.name,
					type: column.type,
					isKey: col.isPrimaryKey || false,  // Primary key
					required: column.required || false,  // NOT NULL constraint
					unique: col.isUnique || false,  // Unique constraint
					autoIncrement: col.autoIncrement || false,  // Auto increment
					defaultValue: defaultValue,  // Default value (cleaned)
					length: col.length,  // Field length
					precision: col.precision,  // Precision (for DECIMAL type)
					scale: col.scale,  // Scale (for DECIMAL type)
					enumValues: col.enumValues,  // Enum values (for ENUM type)
					setValues: col.setValues  // Set values (for SET type)
				}
			})

			// Create or update physical table in the database
			await adapter.tableOp(DBTableAction.CREATE_TABLE, {
				schema: table.schema || undefined,
				table: table.name,
				columns: cleanedColumns,
				createMode: DBCreateTableMode.UPGRADE
			})

			// Update table status to ACTIVE
			await this.update(table.id, { status: XpertTableStatus.ACTIVE, activatedAt: new Date(), message: null })
			this.#logger.log(`Table ${table.name} activated successfully`)
		} catch (error) {
			this.#logger.error(`Table activation failed for ${table.name}: ${getErrorMessage(error)}`)
			await this.update(table.id, { status: XpertTableStatus.ERROR, message: getErrorMessage(error) })
			// Ensure error is properly formatted as HTTP exception
			if (error instanceof BadRequestException) {
				throw error
			} else {
				throw new BadRequestException(`Table activation failed: ${getErrorMessage(error)}`)
			}
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

	public async insertRow(tableId: string, row: { name: string; value: any; type: string }[]) {
		const table = await this.findOneByIdString(tableId)
		if (table.status !== XpertTableStatus.ACTIVE) {
			throw new BadRequestException(`Table ${table.name} is not active.`)
		}

		// Get the database adapter
		const adapter = await this.queryBus.execute(
			new XpertDatabaseAdapterQuery({
				id: table.database
			})
		)
		try {
			// Create or update physical table in the database
			return await adapter.tableDataOp(DBTableDataAction.INSERT, {
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
					type: column.type
				})),
				values: row.reduce((acc, column) => {
					acc[column.name] = column.value
					return acc
				}, {})
			})
		} catch (error) {
			console.error(error)
			throw error
		} finally {
			adapter.teardown()
		}
	}

	async executeSql(tableId: string, statement: string) {
		const table = await this.findOneByIdString(tableId)
		if (table.status !== XpertTableStatus.ACTIVE) {
			throw new BadRequestException(`Table ${table.name} is not active.`)
		}

		// Get the database adapter
		const adapter = await this.queryBus.execute(
			new XpertDatabaseAdapterQuery({
				id: table.database
			})
		)

		try {
			// Create or update physical table in the database
			return await adapter.runQuery(statement, { catalog: table.schema || undefined })
		} catch (error) {
			console.error(error)
			throw error
		} finally {
			adapter.teardown()
		}
	}

	/**
	 * Delete table record and physical table
	 */
	async deleteTable(tableId: string) {
		const table = await this.findOneByIdString(tableId)
		if (!table) {
			throw new BadRequestException(`Table with id ${tableId} not found.`)
		}

		// If table is active, delete physical table first
		if (table.status === XpertTableStatus.ACTIVE && table.name && table.database) {
			try {
				// Get the database adapter
				const adapter = await this.queryBus.execute(
					new XpertDatabaseAdapterQuery({
						id: table.database
					})
				)

				try {
					// Drop physical table from database
					await adapter.tableOp(DBTableAction.DROP_TABLE, {
						schema: table.schema || undefined,
						table: table.name
					})
					this.#logger.log(`Physical table ${table.schema ? table.schema + '.' : ''}${table.name} dropped successfully`)
				} catch (error) {
					this.#logger.error(`Error dropping physical table: ${getErrorMessage(error)}`)
					// Continue deleting logical table record even if dropping physical table fails
				} finally {
					adapter.teardown()
				}
			} catch (error) {
				this.#logger.error(`Error getting database adapter: ${getErrorMessage(error)}`)
			}
		}

		// Delete logical table record (soft delete)
		return await this.softDelete(tableId)
	}
}
