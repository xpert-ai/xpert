import type { IExecutionTaskControl, ITaskControlPublication, TaskControlRef } from '@xpert-ai/contracts'
import type { TaskControlContext, TaskControlRef as SdkTaskControlRef } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { TenantOrganizationBaseEntity } from '../core/entities/tenant-organization-base.entity'
import { ExecutionTaskControl } from './task-control.entity'
import { TaskControlPublication } from './task-control-publication.entity'
import { TaskControlStore, taskControlId } from './task-control.store'
import {
	createTaskControlScopeTables,
	seedTaskControlScope,
	taskControlTestEntities
} from './testing/task-control.fixture'

class MetadataDataSource extends DataSource {
	buildEntityMetadata() {
		return this.buildMetadatas()
	}
}
describe('Task control base entities and SDK contracts', () => {
	it('inherits one generated id, audit fields and scope relations for each entity', async () => {
		const database = new MetadataDataSource({ type: 'postgres', entities: taskControlTestEntities })
		await database.buildEntityMetadata()
		const task: IExecutionTaskControl = new ExecutionTaskControl()
		const publication: ITaskControlPublication = new TaskControlPublication()
		for (const entity of [task, publication]) expect(entity).toBeInstanceOf(TenantOrganizationBaseEntity)
		for (const entity of [ExecutionTaskControl, TaskControlPublication]) {
			const metadata = database.getMetadata(entity)
			expect(metadata.primaryColumns.map((column) => column.propertyName)).toEqual(['id'])
			expect(metadata.primaryColumns[0].generationStrategy).toBe('uuid')
			expect(metadata.createDateColumn.propertyName).toBe('createdAt')
			expect(metadata.updateDateColumn.propertyName).toBe('updatedAt')
			expect(metadata.relations.map((relation) => relation.propertyName).sort()).toEqual([
				'createdBy',
				'organization',
				'tenant',
				'updatedBy'
			])
		}
	})
	it('keeps the SDK root export assignable to the shared contract and handler context', async () => {
		const reference: TaskControlRef = { version: 2, targetId: randomUUID() }
		const sdkReference: SdkTaskControlRef = reference
		const context: TaskControlContext = {
			reference: sdkReference,
			signal: new AbortController().signal,
			desired: async () => 'running'
		}
		expect(context.reference).toBe(reference)
		expect(await context.desired()).toBe('running')
	})
})

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const migration = readFileSync(join(__dirname, 'migration.sql'), 'utf8')
const legacy =
	'-- Phase 2: apply before host/worker rollout; no historical task ownership is inferred.\nCREATE TABLE IF NOT EXISTS execution_task_control (\n  id uuid PRIMARY KEY, "rootId" uuid NOT NULL, "parentId" uuid,\n  "tenantId" uuid NOT NULL, "organizationId" uuid,\n  kind varchar NOT NULL, "resourceId" varchar NOT NULL, policy varchar NOT NULL,\n  ancestors jsonb NOT NULL, "threadId" varchar, "currentExecutionId" varchar,\n  attempts jsonb NOT NULL DEFAULT \'[]\'::jsonb,\n  desired varchar NOT NULL DEFAULT \'running\', revision integer NOT NULL DEFAULT 1,\n  state varchar NOT NULL DEFAULT \'queued\', claim uuid,\n  "drainOnPause" boolean NOT NULL DEFAULT false,\n  "nextCheckAt" timestamptz NOT NULL DEFAULT now(), "deliveryToken" uuid, "deliveryUntil" timestamptz,\n  observation varchar, outcome varchar,\n  UNIQUE (kind, "resourceId", "tenantId", "organizationId")\n);\nCREATE INDEX IF NOT EXISTS "IDX_execution_task_root" ON execution_task_control ("rootId");\nCREATE INDEX IF NOT EXISTS "IDX_execution_task_due" ON execution_task_control ("nextCheckAt", id);\nCREATE INDEX IF NOT EXISTS "IDX_execution_task_ancestors" ON execution_task_control USING gin (ancestors);\nCREATE INDEX IF NOT EXISTS "IDX_execution_task_attempts" ON execution_task_control USING gin (attempts);\nCREATE TABLE IF NOT EXISTS execution_task_publication (\n  "targetId" uuid PRIMARY KEY, transport varchar NOT NULL, payload jsonb NOT NULL, result jsonb,\n  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "publishedAt" timestamptz\n);\nCREATE INDEX IF NOT EXISTS "IDX_execution_task_publication_due" ON execution_task_publication (transport, "nextAttemptAt") WHERE "publishedAt" IS NULL;\n'
integration.each(['fresh', 'legacy'] as const)('task control %s migration / PostgreSQL', (mode) => {
	const schema = `task_base_${randomUUID().replace(/-/g, '')}`
	const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
	const input = { ...scope, kind: 'managed-queue' as const, resourceId: 'persisted-task' }
	const stableId = taskControlId(input),
		claim = randomUUID()
	let database: DataSource, store: TaskControlStore
	beforeAll(async () => {
		if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Disposable _test database required')
		database = await new DataSource({
			type: 'postgres',
			url,
			schema,
			uuidExtension: 'pgcrypto',
			extra: { options: `-c search_path=${schema},public` },
			entities: taskControlTestEntities
		}).initialize()
		await database.query(`CREATE SCHEMA "${schema}"`)
		await createTaskControlScopeTables(database)
		await seedTaskControlScope(database, scope)
		if (mode === 'legacy') {
			await database.query(legacy)
			await database.query(
				`INSERT INTO execution_task_control (id, "rootId", "tenantId", "organizationId", kind, "resourceId", policy, ancestors, desired, revision, state, claim)
        VALUES ($1, $1, $2, $3, 'managed-queue', $4, 'attached', $5, 'terminated', 4, 'running', $6)`,
				[stableId, scope.tenantId, scope.organizationId, input.resourceId, JSON.stringify([stableId]), claim]
			)
			await database.query(
				`INSERT INTO execution_task_publication ("targetId", transport, payload, result, "publishedAt")
        VALUES ($1, 'managed-queue', '{"job":"saved"}', '{"done":true}', now())`,
				[stableId]
			)
		}
		await database.query(migration)
		await database.query(migration)
		store = new TaskControlStore(database)
	})
	afterAll(async () => {
		if (database?.isInitialized) {
			await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
			await database.destroy()
		}
	})
	it('matches inherited columns, nullability and relations in the SQL schema', async () => {
		const runner = database.createQueryRunner()
		try {
			for (const entity of [ExecutionTaskControl, TaskControlPublication]) {
				const metadata = database.getMetadata(entity),
					table = await runner.getTable(`${schema}.${metadata.tableName}`)
				expect(table.primaryColumns.map((column) => column.name)).toEqual(['id'])
				expect(table.columns.map((column) => column.name).sort()).toEqual(
					metadata.columns.map((column) => column.databaseName).sort()
				)
				expect(table.foreignKeys.map((key) => key.columnNames[0]).sort()).toEqual([
					'createdById',
					'organizationId',
					'tenantId',
					'updatedById'
				])
				for (const column of metadata.columns) {
					const actual = table.columns.find((candidate) => candidate.name === column.databaseName)
					expect(actual.type).toBe(database.driver.normalizeType(column))
					expect(actual.isNullable).toBe(column.isNullable)
				}
			}
		} finally {
			await runner.release()
		}
	})
	it('retains stable task identity, termination, claims and published results across repeated registration', async () => {
		if (mode === 'fresh') {
			await store.publish(input, { job: 'saved' })
			await store.claim(stableId)
			await store.change(stableId, 'terminated')
			await store.publicationResult(stableId, { done: true })
			await store.published(stableId, true)
		}
		const before = await store.read(stableId),
			publication = await store.publication(stableId)
		expect(before).toMatchObject({
			id: stableId,
			desired: 'terminated',
			state: 'running',
			claim: expect.any(String)
		})
		if (mode === 'legacy') expect(before).toMatchObject({ claim, revision: 4 })
		expect(publication).toMatchObject({
			...scope,
			targetId: stableId,
			id: expect.any(String),
			result: { done: true },
			publishedAt: expect.any(Date)
		})
		expect(before.createdAt).toBeInstanceOf(Date)
		expect(publication.createdAt).toBeInstanceOf(Date)
		await store.publish(input, { job: 'saved' })
		expect(await store.read(stableId)).toMatchObject({ id: stableId, desired: 'terminated', claim: before.claim })
		expect((await store.publication(stableId)).id).toBe(publication.id)
		await expect(store.claim(stableId)).rejects.toMatchObject({ reason: 'terminated' })
	})
	it('creates only one publication under concurrent requests, with task-derived scope', async () => {
		const task = { ...scope, organizationId: null, kind: 'handoff' as const, resourceId: randomUUID() }
		const results = await Promise.all([store.publish(task, { value: 1 }), store.publish(task, { value: 1 })])
		expect(results[0].id).toBe(results[1].id)
		const publication = await store.publication(results[0].id)
		expect(publication).toMatchObject({ tenantId: scope.tenantId, organizationId: null })
		expect(await database.getRepository(TaskControlPublication).countBy({ targetId: results[0].id })).toBe(1)
		await expect(
			database.getRepository(TaskControlPublication).insert({ ...publication, id: randomUUID() })
		).rejects.toMatchObject({ code: '23505' })
		const actor = randomUUID()
		await database.manager.insert('User', { id: actor })
		publication.updatedById = actor
		await database.manager.save(publication)
		expect(
			await database
				.getRepository(TaskControlPublication)
				.findOneOrFail({ where: { id: publication.id }, relations: { updatedBy: true, tenant: true } })
		).toMatchObject({ tenant: { id: scope.tenantId }, updatedBy: { id: actor } })
	})
	it('rejects missing tenant scope before task registration', async () => {
		await expect(store.register({ ...input, tenantId: '' })).rejects.toMatchObject({ reason: 'scope' })
	})
	it('rejects an orphaned publication without inventing an owner', async () => {
		const id = randomUUID()
		await database.query(
			`INSERT INTO execution_task_publication ("targetId", transport, payload) VALUES ($1, 'handoff', '{}')`,
			[id]
		)
		const runner = database.createQueryRunner()
		try {
			await expect(runner.query(migration)).rejects.toThrow('ownership requires repair')
		} finally {
			await runner.query('ROLLBACK')
			await runner.release()
			await database.getRepository(TaskControlPublication).delete({ targetId: id })
		}
	})
})
