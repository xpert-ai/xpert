jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, EntitySchema, getMetadataArgsStorage } from 'typeorm'
import { XpertProjectTask } from './project-task.entity'

const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const migration = readFileSync(join(__dirname, '../migrations/20261110000000-task-review-subtasks.sql'), 'utf8')
const check = readFileSync(join(__dirname, '../migrations/checks/20261110000000-task-review-subtasks.sql'), 'utf8')

integration('Review candidate binding / PostgreSQL', () => {
    let database: DataSource
    const schema = `review_subject_${randomUUID().replace(/-/g, '')}`
    const subject = {
        implementationTaskId: randomUUID(), implementationExecutionId: randomUUID(),
        specificationDigest: `sha256:${'a'.repeat(64)}`
    }

    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_execution_test_')) throw new Error('Dedicated test database required')
        // Reuse the actual entity's new column mapping; unrelated entity relations are outside this fixture.
        const column = getMetadataArgsStorage().columns.find((item) =>
            item.target === XpertProjectTask && item.propertyName === 'reviewSubject'
        )
        if (column?.options.type !== 'jsonb' || column.options.nullable !== true)
            throw new Error('Review subject must have an explicit nullable JSONB entity mapping')
        database = await new DataSource({ type: 'postgres', url }).initialize()
        await database.query(`CREATE SCHEMA ${schema}`)
        await database.destroy()
        database = await new DataSource({ type: 'postgres', url, schema,
            extra: { options: `-c search_path=${schema}` },
            entities: [new EntitySchema<XpertProjectTask>({
                name: 'XpertProjectTask', target: XpertProjectTask, tableName: 'xpert_project_task', columns: {
                    id: { type: 'uuid', primary: true }, name: { type: 'varchar' },
                    reviewSubject: { type: column.options.type, nullable: column.options.nullable }
                }
            })]
        }).initialize()
    })

    beforeEach(async () => {
        await database.query('DROP TABLE IF EXISTS xpert_project_task')
        await database.query('CREATE TABLE xpert_project_task (id uuid PRIMARY KEY, name varchar NOT NULL)')
    })
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA ${schema} CASCADE`)
            await database.destroy()
        }
    })

    it('upgrades existing rows and round-trips the candidate binding without changing it on reapplication', async () => {
        const id = randomUUID()
        await database.query('INSERT INTO xpert_project_task (id, name) VALUES ($1, $2)', [id, 'Existing task'])
        expect(await database.query(check)).toEqual([{ missing: 'xpert_project_task.reviewSubject' }])
        await database.query(migration)
        expect(await database.query(check)).toEqual([])
        const tasks = database.getRepository(XpertProjectTask)
        expect(await tasks.findOneBy({ id })).toMatchObject({ name: 'Existing task', reviewSubject: null })
        await tasks.update({ id }, { reviewSubject: subject })
        await database.query(migration)
        expect(await tasks.findOneBy({ id })).toMatchObject({ name: 'Existing task', reviewSubject: subject })
        expect(await database.query(check)).toEqual([])
    })

    it('reports a missing table in the deployment check', async () => {
        await database.query('DROP TABLE xpert_project_task')
        expect(await database.query(check)).toEqual([{ missing: 'xpert_project_task.reviewSubject' }])
    })

    it.each(['text', 'jsonb NOT NULL'])('detects an incompatible existing %s column without rewriting it', async (type) => {
        await database.query(`ALTER TABLE xpert_project_task ADD COLUMN "reviewSubject" ${type}`)
        await database.query(migration)
        expect(await database.query(check)).toEqual([{ missing: 'xpert_project_task.reviewSubject' }])
    })
})
