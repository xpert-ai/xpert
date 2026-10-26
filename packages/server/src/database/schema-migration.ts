// Invariants: ordinary tables synchronize; SQL-owned tables never do. TypeORM
// owns migration history and transactions. All DDL uses the same locked session.
import { createHash } from 'node:crypto'
import { DataSource, MigrationExecutor, MigrationInterface, QueryRunner } from 'typeorm'
import { z } from 'zod'
import { validateSql } from './schema-migration-sql'

export const SCHEMA_LOCK_KEY = [1481658964, 1] as const
const historyTable = 'xpert_schema_migrations'
const checksumTable = 'xpert_schema_migration_checksums'
export interface SchemaSqlMigration {
	id: string
	name: string
	sql: string
	check: string
	phase: 'before-sync' | 'after-sync'
	baseline: boolean
}
export interface SchemaMigrationBundle {
	managedTables: string[]
	migrations: SchemaSqlMigration[]
	checks: string[]
	/** Reviewed legacy variants, independent of immutable migration postconditions/checksums. */
	baselineChecks?: string[]
}
export type SchemaMigrationAction = 'apply' | 'verify' | 'baseline'

/** Reuse for legacy plugin synchronization so host and plugin DDL cannot overlap. */
export async function withSchemaLock<T>(
	source: DataSource,
	operation: (runner: QueryRunner) => Promise<T>
): Promise<T> {
	if (source.options.type !== 'postgres') throw new Error('Schema migrations require PostgreSQL')
	const runner = source.createQueryRunner()
	const create = source.createQueryRunner
	const release = runner.release
	let locked = false
	try {
		await runner.connect()
		await runner.query("SELECT set_config('lock_timeout','60s',false),set_config('statement_timeout','300s',false)")
		await runner.query('SELECT pg_advisory_lock($1,$2)', [...SCHEMA_LOCK_KEY])
		locked = true
		source.createQueryRunner = () => runner
		runner.release = async () => {}
		return await operation(runner)
	} finally {
		source.createQueryRunner = create
		runner.release = release
		if (locked) await runner.query('SELECT pg_advisory_unlock($1,$2)', [...SCHEMA_LOCK_KEY]).catch(() => {})
		await runner.release()
	}
}

const rowsSchema = z.array(z.object({ name: z.string() }))
const checksSchema = z.array(z.object({ missing: z.string() }).strict())
const checksumsSchema = z.array(z.object({ name: z.string(), checksum: z.string() }))
const hash = (migration: SchemaSqlMigration) =>
	createHash('sha256')
		.update(JSON.stringify([migration.id, migration.sql, migration.check, migration.phase]))
		.digest('hex')
const sqlState = (error: unknown) =>
	error &&
	typeof error === 'object' &&
	'code' in error &&
	typeof error.code === 'string' &&
	/^[A-Z0-9]{5}$/.test(error.code)
		? error.code
		: 'SCHEMA_MIGRATION_FAILED'

async function verifySql(runner: QueryRunner, sql: string) {
	const missing = checksSchema.parse(await runner.query(sql))
	if (missing.length) {
		const names = missing
			.map((row) => row.missing)
			.filter((name) => /^[A-Za-z0-9_.:-]{1,200}$/.test(name))
			.slice(0, 10)
		throw new Error(`SCHEMA_VERIFICATION_FAILED: ${names.join(', ')}`)
	}
}

async function appliedNames(runner: QueryRunner) {
	const exists = await runner.hasTable(historyTable)
	return exists ? rowsSchema.parse(await runner.query(`SELECT name FROM ${historyTable}`)).map((row) => row.name) : []
}

/** Extend the existing deployment job, without starting a second migration framework. */
export async function synchronizeWithMigrations(
	source: DataSource,
	bundle: SchemaMigrationBundle,
	action: SchemaMigrationAction = 'apply'
) {
	for (const migration of bundle.migrations) {
		validateSql(migration.sql)
		validateSql(migration.check, true)
	}
	bundle.checks.forEach((sql) => validateSql(sql, true))
	if (bundle.baselineChecks?.length === 0) throw new Error('EMPTY_BASELINE_CHECKS')
	bundle.baselineChecks?.forEach((sql) => validateSql(sql, true))
	const originalMigrations = [...source.migrations]
	const setMigrations = (migrations: MigrationInterface[]) => {
		source.migrations.splice(0, source.migrations.length, ...migrations)
	}
	const originalFlags = source.entityMetadatas.map((metadata) => metadata.synchronize)
	source.setOptions({ migrationsTableName: historyTable })
	for (const metadata of source.entityMetadatas) {
		if (bundle.managedTables.includes(metadata.tableName)) metadata.synchronize = false
	}
	try {
		return await withSchemaLock(source, async (runner) => {
			const applied = await appliedNames(runner)
			const checksumExists = await runner.hasTable(checksumTable)
			const recorded = checksumExists
				? checksumsSchema.parse(await runner.query(`SELECT name,checksum FROM ${checksumTable}`))
				: []
			for (const migration of bundle.migrations.filter((item) => applied.includes(item.name))) {
				if (recorded.find((item) => item.name === migration.name)?.checksum !== hash(migration)) {
					throw new Error(`MIGRATION_CHECKSUM_MISMATCH: ${migration.id}`)
				}
			}
			if (checksumExists) {
				const owned = rowsSchema.parse(
					await runner.query(
						`SELECT DISTINCT jsonb_array_elements_text(managed_tables) AS name FROM ${checksumTable}`
					)
				)
				if (owned.some((row) => !bundle.managedTables.includes(row.name)))
					throw new Error('SQL_TABLE_OWNERSHIP_REMOVED')
			}
			const verify = async (checks: string[]) => {
				await runner.startTransaction()
				try {
					await runner.query('SET LOCAL transaction_read_only = on')
					for (const sql of checks) await verifySql(runner, sql)
					await runner.commitTransaction()
				} catch (error) {
					await runner.rollbackTransaction()
					throw error
				}
			}
			if (action === 'verify') {
				if (bundle.migrations.some((item) => !applied.includes(item.name)))
					throw new Error('MIGRATIONS_PENDING')
				await verify(bundle.checks)
				return
			}
			if (action === 'apply' && !applied.length) {
				const existing = rowsSchema.parse(
					await runner.query(
						`SELECT tablename AS name FROM pg_tables WHERE schemaname=current_schema() AND tablename=ANY($1::text[])`,
						[bundle.managedTables]
					)
				)
				if (existing.length)
					throw new Error(
						'BASELINE_REQUIRED: verify and adopt existing SQL-owned tables with --action=baseline'
					)
			}
			await runner.query(`CREATE TABLE IF NOT EXISTS ${checksumTable}(
				name varchar(255) PRIMARY KEY, checksum varchar(64) NOT NULL, managed_tables jsonb NOT NULL)`)
			const record = async (migration: SchemaSqlMigration) =>
				runner.query(`INSERT INTO ${checksumTable}(name,checksum,managed_tables) VALUES($1,$2,$3)`, [
					migration.name,
					hash(migration),
					JSON.stringify(bundle.managedTables)
				])
			const native = (migration: SchemaSqlMigration): MigrationInterface => ({
				name: migration.name,
				up: async (queryRunner) => {
					try {
						await queryRunner.query(migration.sql)
						await verifySql(queryRunner, migration.check)
						await record(migration)
					} catch (error) {
						if (error instanceof Error && error.message.startsWith('SCHEMA_VERIFICATION_FAILED:'))
							throw error
						// TypeORM logs migration errors even with query logging disabled.
						throw new Error(`MIGRATION_FAILED: ${migration.id} (${sqlState(error)})`)
					}
				},
				down: async () => {
					throw new Error('Use a reviewed forward migration; automatic database rollback is disabled')
				}
			})
			if (action === 'baseline') {
				const baseline = bundle.migrations.filter((item) => item.baseline && !applied.includes(item.name))
				await runner.startTransaction()
				try {
					setMigrations(baseline.map(native))
					const executor = new MigrationExecutor(source, runner)
					executor.fake = true
					await executor.executePendingMigrations()
					for (const migration of baseline) await record(migration)
					await runner.query('SET LOCAL transaction_read_only = on')
					for (const sql of bundle.baselineChecks ?? baseline.map((migration) => migration.check))
						await verifySql(runner, sql)
					await runner.commitTransaction()
				} catch (error) {
					await runner.rollbackTransaction()
					throw error
				}
				return
			}
			for (const phase of ['before-sync', 'after-sync']) {
				if (phase === 'after-sync') {
					runner.loadedTables = []
					runner.loadedViews = []
					await source.synchronize()
				}
				setMigrations(bundle.migrations.filter((item) => item.phase === phase).map(native))
				const executor = new MigrationExecutor(source, runner)
				executor.transaction = 'each'
				await executor.executePendingMigrations()
			}
			await verify(bundle.checks)
		})
	} catch (error) {
		// PostgreSQL error detail and TypeORM query parameters can contain business data.
		if (
			error instanceof Error &&
			/^(SCHEMA_VERIFICATION_FAILED|MIGRATION_FAILED|MIGRATION_CHECKSUM_MISMATCH|SQL_TABLE_OWNERSHIP_REMOVED|MIGRATIONS_PENDING|BASELINE_REQUIRED)/.test(
				error.message
			)
		)
			throw error
		throw new Error(sqlState(error))
	} finally {
		setMigrations(originalMigrations)
		source.entityMetadatas.forEach((metadata, index) => {
			metadata.synchronize = originalFlags[index]
		})
	}
}
