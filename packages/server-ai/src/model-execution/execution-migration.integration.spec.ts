import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DataSource, QueryRunner } from 'typeorm'

const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('model execution additive migration / PostgreSQL', () => {
    let database: DataSource
    let runner: QueryRunner
    const schema = `execution_migration_${randomUUID().replace(/-/g, '')}`
    const migration = readFileSync(join(__dirname, 'migrations/20260930-model-execution.sql'), 'utf8')

    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_execution_test_'))
            throw new Error('Dedicated test database required')
        database = await new DataSource({ type: 'postgres', url }).initialize()
        runner = database.createQueryRunner()
        await runner.connect()
        await runner.query(`CREATE SCHEMA ${schema}`)
        await runner.query(`SET search_path TO ${schema}`)
    })

    beforeEach(async () => {
        await runner.query(`
            DROP TABLE IF EXISTS model_execution_reconciliation, cli_session, model_gateway_call, model_execution_grant,
                membership_point_ledger, chat_conversation, xpert, "user", organization, tenant CASCADE;
            CREATE TABLE tenant (id uuid PRIMARY KEY);
            CREATE TABLE organization (id uuid PRIMARY KEY);
            CREATE TABLE "user" (id uuid PRIMARY KEY);
            CREATE TABLE chat_conversation (id uuid PRIMARY KEY);
            CREATE TABLE xpert (id uuid PRIMARY KEY);
            CREATE TABLE membership_point_ledger (id uuid PRIMARY KEY);
            CREATE TABLE model_gateway_call (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid, "userId" uuid,
                "apiKeyId" uuid NOT NULL, "publicationId" uuid NOT NULL,
                "startedAt" timestamptz NOT NULL DEFAULT now(), status varchar NOT NULL DEFAULT 'started'
            );
            INSERT INTO model_gateway_call ("apiKeyId", "publicationId") VALUES (gen_random_uuid(), gen_random_uuid());
        `)
    })

    afterAll(async () => {
        if (runner) {
            await runner.query('ROLLBACK')
            await runner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
            await runner.release()
        }
        if (database?.isInitialized) await database.destroy()
    })

    it('can run twice and preserves external calls while enforcing source separation', async () => {
        await runner.query(migration)
        await runner.query(migration)
        const rows: Array<{ source: string; reservedTokens: number; estimatedUsage: unknown }> = await runner.query(
            'SELECT source, "reservedTokens", "estimatedUsage" FROM model_gateway_call'
        )
        expect(rows).toEqual([{ source: 'external_api', reservedTokens: 0, estimatedUsage: null }])
        await expect(
            runner.query(`INSERT INTO model_gateway_call (source) VALUES ('external_api')`)
        ).rejects.toMatchObject({ code: '23514' })
    })

    it('marks legacy execution attempts as uncertain when introducing the dispatch fence', async () => {
        await runner.query(migration)
        const id = randomUUID()
        await runner.query('INSERT INTO tenant VALUES ($1)', [id])
        await runner.query('INSERT INTO organization VALUES ($1)', [id])
        await runner.query('INSERT INTO "user" VALUES ($1)', [id])
        await runner.query(
            `INSERT INTO model_execution_grant
            (id, "tenantId", "organizationId", "ownerId", "credentialHash", context, models,
             "defaultModelId", limits, "expiresAt", "absoluteExpiresAt")
            VALUES ($1, $1, $1, $1, 'hash', '{}', '[]', 'alias', '{}', now(), now())`,
            [id]
        )
        await runner.query(
            `INSERT INTO model_gateway_call (source, "grantId", "reservedTokens")
            VALUES ('execution_grant', $1, 100)`,
            [id]
        )
        await runner.query('ALTER TABLE model_gateway_call DROP COLUMN "dispatchedAt"')
        await runner.query(migration)
        const rows: Array<{ reservedTokens: number; dispatchedAt: Date; startedAt: Date }> =
            await runner.query(`SELECT "reservedTokens", "dispatchedAt", "startedAt" FROM model_gateway_call
                WHERE source='execution_grant'`)
        expect(rows[0].reservedTokens).toBe(100)
        expect(rows[0].dispatchedAt).toEqual(rows[0].startedAt)
    })

    it('adds reconciliation storage repeatably without resetting existing usage or reservations', async () => {
        await runner.query(migration)
        const operations = readFileSync(join(__dirname, 'migrations/20261001-execution-operations.sql'), 'utf8')
        await runner.query(operations)
        const id = randomUUID()
        await runner.query('INSERT INTO tenant VALUES ($1)', [id])
        await runner.query('INSERT INTO organization VALUES ($1)', [id])
        await runner.query('INSERT INTO "user" VALUES ($1)', [id])
        const calls: Array<{ id: string }> = await runner.query('SELECT id FROM model_gateway_call')
        await runner.query(
            `INSERT INTO model_execution_reconciliation
            (id, "tenantId", "organizationId", "callId", "reviewerId", evidence)
            VALUES ($1, $1, $1, $2, $1, '{"receipt":"retained"}')`,
            [id, calls[0].id]
        )
        await runner.query('UPDATE model_gateway_call SET "reservedTokens" = 123')
        await runner.query(operations)
        expect(await runner.query('SELECT evidence FROM model_execution_reconciliation')).toEqual([
            { evidence: { receipt: 'retained' } }
        ])
        expect(await runner.query('SELECT "reservedTokens" FROM model_gateway_call')).toEqual([{ reservedTokens: 123 }])
        await expect(
            runner.query(
                `INSERT INTO model_execution_reconciliation
            (id, "tenantId", "organizationId", "callId", "reviewerId", evidence)
            VALUES ($1, $2, $2, $3, $2, '{}')`,
                [randomUUID(), id, calls[0].id]
            )
        ).rejects.toMatchObject({ code: '23505' })
    })
})
