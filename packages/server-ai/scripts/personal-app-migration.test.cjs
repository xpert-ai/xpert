// APP_TEST_DATABASE_URL must point to a disposable PostgreSQL database.
// Creates and drops only a uniquely named test schema.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { randomUUID } = require('node:crypto')
const { Pool } = require('pg')

test(
    'personal App migration preserves organization receipts and enforces concurrent owner isolation',
    { skip: !process.env.APP_TEST_DATABASE_URL },
    async () => {
        const pool = new Pool({ connectionString: process.env.APP_TEST_DATABASE_URL })
        const client = await pool.connect()
        const schema = `app_scope_${randomUUID().replaceAll('-', '')}`
        const table = `"${schema}".plugin_application_installation`
        try {
            await client.query(`CREATE SCHEMA "${schema}"`)
            await client.query(`SET search_path TO "${schema}"`)
            await client.query(`CREATE TABLE "user" (id uuid PRIMARY KEY);
      CREATE TABLE plugin_application_installation (
        id uuid PRIMARY KEY, "tenantId" uuid NOT NULL, "organizationId" uuid,
        "pluginName" text NOT NULL, "appName" text NOT NULL, "scopeKey" text NOT NULL,
        "declaredScope" text NOT NULL, "workspaceId" uuid,
        UNIQUE ("tenantId", "pluginName", "appName", "scopeKey")
      )`)
            const tenant = randomUUID(),
                org = randomUUID(),
                alice = randomUUID(),
                bob = randomUUID(),
                workspace = randomUUID()
            await client.query('INSERT INTO "user" VALUES ($1), ($2)', [alice, bob])
            await client.query(
                `INSERT INTO ${table} VALUES ($1, $2, $3, 'plugin', 'app', $3::uuid::text, 'organization', $4)`,
                [randomUUID(), tenant, org, workspace]
            )
            const migration = readFileSync(
                join(__dirname, '../src/plugin-resource/migrations/20261024-personal-app-installations.sql'),
                'utf8'
            )
            await client.query(migration)
            await client.query(migration)
            const legacy = (await client.query(`SELECT * FROM ${table} WHERE "declaredScope" = 'organization'`)).rows[0]
            assert.equal(legacy.scopeKey, org)
            assert.equal(legacy.workspaceId, workspace)
            assert.equal(legacy.ownerUserId, null)
            const insert = (owner, scopeKey = `personal:${org}:${owner}`) =>
                pool.query(
                    `INSERT INTO ${table} (id, "tenantId", "organizationId", "pluginName", "appName", "scopeKey", "declaredScope", "ownerUserId") VALUES ($1,$2,$3,'plugin','app',$4,'personal',$5) ON CONFLICT DO NOTHING RETURNING id`,
                    [randomUUID(), tenant, org, scopeKey, owner]
                )
            const claims = await Promise.all(Array.from({ length: 8 }, () => insert(alice)))
            assert.equal(claims.filter((result) => result.rowCount === 1).length, 1)
            assert.equal((await insert(bob)).rowCount, 1)
            assert.equal((await client.query(`SELECT id FROM ${table}`)).rowCount, 3)
            await assert.rejects(insert(null, 'personal:invalid'), { code: '23514' })
            await assert.rejects(insert(bob, `personal:${org}:${alice}`), { code: '23514' })
            await assert.rejects(insert(randomUUID()), { code: '23503' })
            await assert.rejects(client.query('DELETE FROM "user" WHERE id = $1', [alice]), { code: '23503' })
            assert.equal((await client.query(`SELECT * FROM ${table} WHERE "ownerUserId" = $1`, [bob])).rowCount, 1)
        } finally {
            await client.query(`DROP SCHEMA "${schema}" CASCADE`)
            client.release()
            await pool.end()
        }
    }
)
