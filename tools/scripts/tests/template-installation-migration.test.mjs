import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '../../..')
const require = createRequire(path.join(root, 'package.json'))
const { Client } = require('pg')
const env = { ...require('dotenv').parse(fs.readFileSync(path.join(root, '.env'))), ...process.env }
assert.ok(['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST || 'localhost'), 'Local PostgreSQL only')
const sql = fs.readFileSync(
  path.join(
    root,
    'packages/server-ai/src/plugin-resource/template-installation/migrations/20261013-template-installation.sql'
  ),
  'utf8'
)

test('installation migration is repeatable and enforces tenant/organization/user request identity', async () => {
  const client = new Client({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME || 'postgres',
    user: env.DB_USER || 'postgres',
    password: env.DB_PASS
  })
  await client.connect()
  try {
    await client.query('BEGIN')
    const schema = 'installation_test_' + randomUUID().replaceAll('-', '')
    await client.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}", public`)
    for (const table of ['tenant', 'organization', 'user', 'xpert_workspace'])
      await client.query(`CREATE TABLE "${table}" (id uuid PRIMARY KEY)`)
    await client.query(sql)
    const ids = Array.from({ length: 5 }, () => randomUUID())
    for (const table of ['tenant', 'organization', 'user', 'xpert_workspace'])
      for (const id of ids) await client.query(`INSERT INTO "${table}" VALUES ($1)`, [id])
    const insert = `INSERT INTO template_installation
      ("tenantId","organizationId","userId","workspaceId","idempotencyKey","requestHash","sourceHash",language,input,"assistantId",status,stage)
      VALUES ($1,$2,$3,$4,'same-key','request-hash','source-hash','en','{}',$5,'running','importing') RETURNING id`
    const first = await client.query(insert, ids)
    await client.query(sql)
    assert.equal((await client.query('SELECT count(*) FROM template_installation')).rows[0].count, '1')
    await client.query('SAVEPOINT duplicate')
    await assert.rejects(client.query(insert, ids), { code: '23505' })
    await client.query('ROLLBACK TO SAVEPOINT duplicate')
    for (const position of [0, 1, 2]) {
      const scoped = [...ids]
      scoped[position] = ids[4]
      await client.query(insert, scoped)
    }
    assert.equal((await client.query('SELECT count(*) FROM template_installation')).rows[0].count, '4')
    assert.equal(
      (
        await client.query('SELECT attempt, imported, "publicationCompleted" FROM template_installation WHERE id=$1', [
          first.rows[0].id
        ])
      ).rows[0].attempt,
      0
    )
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
