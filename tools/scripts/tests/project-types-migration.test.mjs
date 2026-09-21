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
const host = env.DB_HOST || 'localhost'
assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), 'Tests require local PostgreSQL')
const config = {
  host,
  port: Number(env.DB_PORT || 5432),
  database: env.DB_NAME || 'postgres',
  user: env.DB_USER || 'postgres',
  password: env.DB_PASS
}
const schemaSql = fs.readFileSync(
  path.join(root, 'packages/server-ai/src/xpert-project/migrations/20260920-project-types.sql'),
  'utf8'
)
const bomSql = fs.readFileSync(
  path.resolve(root, '../solutions/manufacturing/bom-lifecycle/migrations/20260920-project-types.sql'),
  'utf8'
)
const factorySql = fs.readFileSync(
  path.resolve(root, '../xpert-plugins/community/apps/factory-operations/migrations/20260920-project-types.sql'),
  'utf8'
)
const tenantId = randomUUID(),
  organizationId = randomUUID(),
  otherOrganizationId = randomUUID()
const bom = '@xpert-ai/plugin-bom-lifecycle:bom-lifecycle'

async function isolated(run) {
  const client = new Client(config)
  await client.connect()
  try {
    await client.query('BEGIN')
    const schema = 'project_type_test_' + randomUUID().replaceAll('-', '')
    await client.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}"`)
    await client.query(`CREATE TABLE xpert_project (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid,
      name varchar, status varchar, "updatedAt" timestamptz DEFAULT now());
      CREATE TABLE plugin_application_installation (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "pluginName" varchar, "appName" varchar);
      CREATE TABLE plugin_bom_lifecycle_case (id uuid PRIMARY KEY, "workspaceProjectId" uuid, "tenantId" varchar, "organizationId" varchar);
      CREATE TABLE plugin_factory_ops_case (LIKE plugin_bom_lifecycle_case INCLUDING ALL);`)
    await client.query(schemaSql)
    await run(client)
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
}
async function project(client, organization = organizationId) {
  const id = randomUUID()
  await client.query(
    'INSERT INTO xpert_project(id,"tenantId","organizationId",name,status) VALUES ($1,$2,$3,\'Automotive Case\',\'active\')',
    [id, tenantId, organization]
  )
  return id
}
async function link(client, id, app = 'bom', organization = organizationId) {
  const table = app === 'bom' ? 'plugin_bom_lifecycle_case' : 'plugin_factory_ops_case'
  await client.query(`INSERT INTO ${table}(id,"workspaceProjectId","tenantId","organizationId") VALUES ($1,$2,$3,$4)`, [
    randomUUID(),
    id,
    tenantId,
    organization
  ])
}
async function rejected(client, sql) {
  await client.query('SAVEPOINT migration')
  await assert.rejects(client.query(sql), { code: 'P0001' })
  await client.query('ROLLBACK TO SAVEPOINT migration')
}

test('schema is repeatable and preserves unclassified legacy projects', () =>
  isolated(async (client) => {
    const id = await project(client)
    await client.query(schemaSql)
    const row = (await client.query('SELECT * FROM xpert_project WHERE id=$1', [id])).rows[0]
    assert.equal(row.applicationKey, null)
    assert.equal(row.projectTypeKey, null)
    await assert.rejects(client.query('UPDATE xpert_project SET "applicationKey"=\'platform\' WHERE id=$1', [id]), {
      code: '23514'
    })
  }))

test('backfills only authoritative links, preserves ids and business timestamps, and is idempotent', () =>
  isolated(async (client) => {
    const id = await project(client),
      unlinked = await project(client)
    await link(client, id)
    const before = (await client.query('SELECT * FROM xpert_project WHERE id=$1', [id])).rows[0]
    await client.query(bomSql)
    await client.query(bomSql)
    const rows = (await client.query('SELECT * FROM xpert_project')).rows
    const after = rows.find((row) => row.id === id)
    assert.equal(after.applicationKey, bom)
    assert.equal(after.projectTypeKey, 'case')
    for (const key of ['id', 'name', 'status', 'updatedAt', 'tenantId', 'organizationId'])
      assert.deepEqual(after[key], before[key])
    assert.equal(rows.find((row) => row.id === unlinked).applicationKey, null)
  }))

test('cannot reclassify a project claimed by another app', () =>
  isolated(async (client) => {
    const id = await project(client)
    await link(client, id, 'bom')
    await link(client, id, 'factory')
    await client.query(bomSql)
    await rejected(client, factorySql)
    assert.equal(
      (await client.query('SELECT "applicationKey" FROM xpert_project WHERE id=$1', [id])).rows[0].applicationKey,
      bom
    )
  }))

test('rejects a cross-organization business link without partially applying other claims', () =>
  isolated(async (client) => {
    const valid = await project(client),
      invalid = await project(client, otherOrganizationId)
    await link(client, valid)
    await link(client, invalid)
    await rejected(client, bomSql)
    assert.ok(
      (await client.query('SELECT "applicationKey" FROM xpert_project')).rows.every(
        (row) => row.applicationKey === null
      )
    )
  }))

test('records an installation only from the matching application and organization', () =>
  isolated(async (client) => {
    const id = await project(client),
      installationId = randomUUID()
    await link(client, id)
    await client.query(
      `INSERT INTO plugin_application_installation VALUES ($1,$3,$4,'@xpert-ai/plugin-bom-lifecycle','bom-lifecycle'),
    ($2,$3,$5,'@xpert-ai/plugin-bom-lifecycle','bom-lifecycle')`,
      [installationId, randomUUID(), tenantId, organizationId, otherOrganizationId]
    )
    await client.query(bomSql)
    assert.equal(
      (await client.query('SELECT "applicationInstallationId" FROM xpert_project WHERE id=$1', [id])).rows[0]
        .applicationInstallationId,
      installationId
    )
  }))
