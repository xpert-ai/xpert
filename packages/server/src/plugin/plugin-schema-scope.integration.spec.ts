import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { Column, DataSource, Entity, JoinTable, ManyToMany, ManyToOne, PrimaryColumn } from 'typeorm'
import { scopePluginSchemaSynchronization } from './plugin-schema-scope'

@Entity('host_project')
class HostProject {
	@PrimaryColumn('uuid') id!: string
	@Column('text') unrelatedRequiredColumn!: string
}

@Entity('plugin_docx_editor_version')
class OtherPluginVersion {
	@PrimaryColumn('uuid') id!: string
	@Column('uuid') documentId!: string
}

@Entity('plugin_scope_item')
class PluginItem {
	@PrimaryColumn('uuid') id!: string
	@Column({ type: 'text', nullable: true }) label?: string
	@ManyToOne(() => HostProject, { nullable: true }) project?: HostProject
	@ManyToMany(() => HostProject)
	@JoinTable({ name: 'plugin_scope_item_projects' })
	projects?: HostProject[]
}

@Entity({ name: 'plugin_scope_manual', synchronize: false })
class ManualTable {
	@PrimaryColumn('uuid') id!: string
	@Column('text') mustNotBeAdded!: string
}

// Opt in with an expendable PostgreSQL schema; credentials are passed only in the environment.
const describePostgres = process.env.XPERT_SCHEMA_TEST_DATABASE_URL ? describe : describe.skip
describePostgres('plugin schema ownership against PostgreSQL', () => {
	const schema = `plugin_scope_test_${randomUUID().replace(/-/g, '')}`
	const dataSource = new DataSource({
		type: 'postgres',
		url: process.env.XPERT_SCHEMA_TEST_DATABASE_URL,
		schema,
		entities: [HostProject, OtherPluginVersion, PluginItem, ManualTable],
		synchronize: false
	})
	const existingId = randomUUID()

	beforeAll(async () => {
		await dataSource.initialize()
		await dataSource.query(`CREATE SCHEMA "${schema}"`)
		await dataSource.query(`CREATE TABLE "${schema}".host_project (id uuid PRIMARY KEY)`)
		await dataSource.query(
			`CREATE TABLE "${schema}".plugin_docx_editor_version (id uuid PRIMARY KEY, "documentId" varchar NOT NULL)`
		)
		await dataSource.query(`INSERT INTO "${schema}".plugin_docx_editor_version VALUES ($1, $2)`, [
			existingId,
			existingId
		])
		await dataSource.query(`CREATE TABLE "${schema}".plugin_scope_item (id uuid PRIMARY KEY)`)
		await dataSource.query(`INSERT INTO "${schema}".plugin_scope_item VALUES ($1)`, [existingId])
		await dataSource.query(`CREATE TABLE "${schema}".plugin_scope_manual (id uuid PRIMARY KEY)`)
	}, 30000)

	afterAll(async () => {
		if (dataSource.isInitialized) {
			await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`)
			await dataSource.destroy()
		}
	})

	it('updates only the selected plugin, including owned join tables and cross-plugin foreign keys', async () => {
		scopePluginSchemaSynchronization(dataSource, [PluginItem, ManualTable], 'scope')
		await dataSource.synchronize()
		const runner = dataSource.createQueryRunner()
		try {
			const host = await runner.getTable(`${schema}.host_project`)
			const other = await runner.getTable(`${schema}.plugin_docx_editor_version`)
			const plugin = await runner.getTable(`${schema}.plugin_scope_item`)
			const manual = await runner.getTable(`${schema}.plugin_scope_manual`)
			expect(host?.columns.map((column) => column.name)).toEqual(['id'])
			expect(other?.findColumnByName('documentId')?.type).toBe('character varying')
			expect(await dataSource.query(`SELECT "documentId" FROM "${schema}".plugin_docx_editor_version`)).toEqual([
				{ documentId: existingId }
			])
			expect(plugin?.findColumnByName('label')).toBeDefined()
			expect(plugin?.foreignKeys.some((key) => key.referencedTableName.endsWith('host_project'))).toBe(true)
			expect(await runner.hasTable(`${schema}.plugin_scope_item_projects`)).toBe(true)
			expect(manual?.columns.map((column) => column.name)).toEqual(['id'])
			expect(await dataSource.query(`SELECT id FROM "${schema}".plugin_scope_item`)).toEqual([{ id: existingId }])
			await dataSource.synchronize()
		} finally {
			await runner.release()
		}
	}, 30000)
})
