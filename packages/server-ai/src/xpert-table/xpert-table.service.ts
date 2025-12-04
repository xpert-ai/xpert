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

	/**
	 * 验证表名是否可用
	 * - 如果是更新现有表且表名未改变，返回 true
	 * - 如果是新建表或改名，检查物理表是否存在
	 * 
	 * Validate if table name is available
	 * - If updating existing table and name unchanged, return true
	 * - If creating new table or renaming, check if physical table exists
	 */
	async validateTableName(entity: XpertTable): Promise<boolean> {
		// 如果是更新操作
		// If it's an update operation
		if (entity.id) {
			const old = await this.findOneByIdString(entity.id)
			// 如果表名、schema、数据库都没变，直接返回 true（允许更新字段）
			// If name, schema, database unchanged, return true (allow updating columns)
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
			this.#logger.error(`Error validating table name: ${getErrorMessage(error)}`)
			return false
		}
	}

	async upsertTable(entity: XpertTable): Promise<XpertTable> {
		if (!entity.name || !entity.database) {
			throw new BadRequestException(`Table name and database are required for upsert operation.`)
		}
		
		// 验证表名（只在新建或改名时检查）
		// Validate table name (only check when creating new or renaming)
		const isValid = await this.validateTableName(entity)
		if (!isValid) {
			throw new BadRequestException(
				`Table name ${entity.schema ? entity.schema + '.' : ''}${entity.name} already exists in the database.`
			)
		}
		
		let table: XpertTable = null
		if (entity.id) {
			// 检查表名是否改变，如果改变需要重命名物理表
			// Check if table name changed, need to rename physical table if changed
			const old = await this.findOneByIdString(entity.id)
			if (old.name !== entity.name && old.status === XpertTableStatus.ACTIVE) {
				try {
					const adapter = await this.queryBus.execute(
						new XpertDatabaseAdapterQuery({
							id: old.database
						})
					)
					// 重命名物理表
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

		// 激活表以同步物理表结构
		// Activate the table to sync physical table structure
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
				columns: table.columns.map((column) => {
					const col = column as any  // 类型断言以访问新添加的属性
					return {
						name: column.name,
						fieldName: column.name,
						type: column.type,
						isKey: col.isPrimaryKey || false,  // 主键
						required: column.required || false,  // NOT NULL约束
						unique: col.isUnique || false,  // 唯一约束
						autoIncrement: col.autoIncrement || false,  // 自增
						defaultValue: col.defaultValue,  // 默认值
						length: col.length,  // 字段长度
						fraction: col.scale || col.precision  // 小数位数（用于decimal类型）
					}
				}),
				createMode: DBCreateTableMode.UPGRADE
			})

			// Update table status to ACTIVE
			await this.update(table.id, { status: XpertTableStatus.ACTIVE, activatedAt: new Date(), message: null })
			this.#logger.log(`Table ${table.name} activated successfully`)
		} catch (error) {
			this.#logger.error(`Table activation failed for ${table.name}: ${getErrorMessage(error)}`)
			await this.update(table.id, { status: XpertTableStatus.ERROR, message: getErrorMessage(error) })
			throw error
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

	async insertRow(tableId: string, row: { name: string; value: any; type: string }[]) {
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
	 * 删除表记录和物理表
	 * Delete table record and physical table
	 */
	async deleteTable(tableId: string) {
		const table = await this.findOneByIdString(tableId)
		if (!table) {
			throw new BadRequestException(`Table with id ${tableId} not found.`)
		}

		// 如果表已激活，先删除物理表
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
					// 删除物理表
					// Drop physical table from database
					await adapter.tableOp(DBTableAction.DROP_TABLE, {
						schema: table.schema || undefined,
						table: table.name
					})
					this.#logger.log(`Physical table ${table.schema ? table.schema + '.' : ''}${table.name} dropped successfully`)
				} catch (error) {
					this.#logger.error(`Error dropping physical table: ${getErrorMessage(error)}`)
					// 即使删除物理表失败，也继续删除逻辑表记录
					// Continue deleting logical table record even if dropping physical table fails
				} finally {
					adapter.teardown()
				}
			} catch (error) {
				this.#logger.error(`Error getting database adapter: ${getErrorMessage(error)}`)
			}
		}

		// 删除逻辑表记录（软删除）
		// Delete logical table record (soft delete)
		return await this.softDelete(tableId)
	}
}
