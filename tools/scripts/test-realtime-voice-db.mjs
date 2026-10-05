/** Disposable database only: no platform credentials, volumes or existing databases. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import 'reflect-metadata'

const require = createRequire(import.meta.url)
const { Pool } = require('pg')
const { DataSource, Entity, PrimaryColumn } = require('typeorm')
const root = fileURLToPath(new URL('../../', import.meta.url))
function loadVoiceEntities() {
  const compiler = require('ts-node').register({
    project: join(root, 'tsconfig.base.json'),
    transpileOnly: true,
    compilerOptions: { module: 'commonjs' }
  })
  const { compilerOptions } = require(join(root, 'tsconfig.base.json'))
  // Use the actual base entity source without bootstrapping the server-core barrel.
  const unregister = require('tsconfig-paths').register({
    baseUrl: root,
    paths: {
      ...compilerOptions.paths,
      '@xpert-ai/server-core': ['packages/server/src/core/entities/tenant-organization-base.entity.ts']
    }
  })
  try {
    return require(join(root, 'packages/server-ai/src/realtime-voice/voice.entity.ts'))
  } finally {
    unregister()
    compiler.enabled(false)
  }
}
const { RealtimeVoiceSession, RealtimeVoiceTask, RealtimeVoiceTurn } = loadVoiceEntities()
const container = `bosi-voice-test-${randomBytes(6).toString('hex')}`
const password = randomBytes(24).toString('hex')
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, POSTGRES_PASSWORD: password }
  }).trim()
let pool
let dataSource
try {
  docker(
    'run',
    '--rm',
    '--detach',
    '--name',
    container,
    '--publish',
    '127.0.0.1::5432',
    '--env',
    'POSTGRES_PASSWORD',
    '--tmpfs',
    '/var/lib/postgresql/data',
    'postgres:16-alpine'
  )
  const port = Number(docker('port', container, '5432/tcp').split(':').at(-1))
  pool = new Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password,
    database: 'postgres',
    max: 12,
    connectionTimeoutMillis: 1000
  })
  let ready = false
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await pool.query('SELECT 1')
      ready = true
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  assert.ok(ready, 'Disposable PostgreSQL must become ready')
  // Only unrelated parent relation targets are fixtures; voice/base columns and indexes come from source.
  const parentEntities = [
    [class Tenant {}, 'tenant'],
    [class Organization {}, 'organization'],
    [class User {}, 'user']
  ].map(([target, tableName]) => {
    Entity(tableName)(target)
    PrimaryColumn({ type: 'uuid' })(target.prototype, 'id')
    return target
  })
  dataSource = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port,
    username: 'postgres',
    password,
    database: 'postgres',
    uuidExtension: 'pgcrypto',
    entities: [...parentEntities, RealtimeVoiceSession, RealtimeVoiceTask, RealtimeVoiceTurn],
    synchronize: false,
    logging: false
  })
  await dataSource.initialize()
  await dataSource.synchronize()
  await dataSource.synchronize()
  assert.equal((await dataSource.driver.createSchemaBuilder().log()).upQueries.length, 0)
  const id = randomUUID(),
    sessionId = randomUUID()
  const scope = { tenantId: id, organizationId: id, userId: id, assistantId: id, threadId: id, conversationId: id }
  for (const table of ['tenant', 'organization', 'user']) await pool.query(`INSERT INTO "${table}" VALUES ($1)`, [id])
  await pool.query(
    `INSERT INTO realtime_voice_session (id,"tenantId","organizationId","userId","threadId","assistantId",scope,"configurationHash","originMode","expiresAt")
    VALUES ($1,$2,$2,$2,$2,$2,$3,'hash','desktop',now()+interval '30 minutes')`,
    [sessionId, id, scope]
  )
  assert.deepEqual(
    (await pool.query('SELECT "startedAt","endedAt" FROM realtime_voice_session WHERE id=$1', [sessionId])).rows[0],
    { startedAt: null, endedAt: null }
  )

  // Distinct primary keys ensure this tests the session/call uniqueness constraint.
  const inserts = await Promise.all(
    Array.from({ length: 8 }, () =>
      pool.query(
        `INSERT INTO realtime_voice_task
    (id,"tenantId","organizationId","sessionId","callId",scope,instruction) VALUES ($1,$2,$2,$3,'same-call',$4,'test') ON CONFLICT DO NOTHING RETURNING id`,
        [randomUUID(), id, sessionId, scope]
      )
    )
  )
  assert.equal(
    inserts.reduce((sum, result) => sum + result.rowCount, 0),
    1
  )
  const taskId = inserts.flatMap((result) => result.rows)[0].id
  const claims = await Promise.all(
    Array.from({ length: 8 }, () =>
      pool.query(
        `UPDATE realtime_voice_task SET status='running'
    WHERE id=$1 AND status='queued' AND "cancelRequested"=false`,
        [taskId]
      )
    )
  )
  assert.equal(
    claims.reduce((sum, result) => sum + result.rowCount, 0),
    1
  )
  const canceledId = randomUUID()
  await pool.query(
    `INSERT INTO realtime_voice_task (id,"tenantId","organizationId","sessionId","callId",scope,instruction,"cancelRequested")
    VALUES ($1,$2,$2,$3,'canceled-call',$4,'test',true)`,
    [canceledId, id, sessionId, scope]
  )
  assert.equal(
    (
      await pool.query(
        `UPDATE realtime_voice_task SET status='running'
    WHERE id=$1 AND status='queued' AND "cancelRequested"=false`,
        [canceledId]
      )
    ).rowCount,
    0
  )

  await pool.query(
    `INSERT INTO realtime_voice_turn ("tenantId","organizationId","sessionId","turnId",role,text)
    VALUES ($1,$1,$2,'turn-1','user','hello'),($1,$1,$2,'turn-1','assistant','hi')`,
    [id, sessionId]
  )
  await assert.rejects(
    pool.query(
      `INSERT INTO realtime_voice_turn ("tenantId","organizationId","sessionId","turnId",role,text)
    VALUES ($1,$1,$2,'turn-1','user','duplicate')`,
      [id, sessionId]
    ),
    { code: '23505' }
  )
  await assert.rejects(
    pool.query(
      `INSERT INTO realtime_voice_turn ("tenantId","organizationId","sessionId","turnId",role,text)
    VALUES ($1,$2,$3,'orphan-tenant','user','hello')`,
      [randomUUID(), id, sessionId]
    ),
    { code: '23503' }
  )
  await pool.query(
    `UPDATE realtime_voice_session SET "usageReceipts"=jsonb_set("usageReceipts",ARRAY[$2]::text[],$3::jsonb,true) WHERE id=$1`,
    [sessionId, 'response.with.dots', JSON.stringify({ inputAudio: 123, outputAudio: 456 })]
  )
  assert.deepEqual(
    (await pool.query('SELECT "usageReceipts" FROM realtime_voice_session WHERE id=$1', [sessionId])).rows[0]
      .usageReceipts,
    { 'response.with.dots': { inputAudio: 123, outputAudio: 456 } }
  )
  const scopedTasks = (tenantId, organizationId, userId) =>
    pool.query(
      `SELECT id FROM realtime_voice_task WHERE id=$4 AND "tenantId"=$1 AND "organizationId"=$2 AND scope->>'userId'=$3`,
      [tenantId, organizationId, userId, taskId]
    )
  assert.equal((await scopedTasks(id, id, id)).rowCount, 1)
  assert.equal((await scopedTasks(randomUUID(), id, id)).rowCount, 0)
  assert.equal((await scopedTasks(id, randomUUID(), id)).rowCount, 0)
  assert.equal((await scopedTasks(id, id, randomUUID())).rowCount, 0)
  await assert.rejects(pool.query(`UPDATE realtime_voice_task SET instruction=NULL WHERE id=$1`, [taskId]), {
    code: '23502'
  })

  const startedAt = new Date('2026-10-05T00:00:00.000Z'),
    endedAt = new Date('2026-10-05T00:01:17.000Z')
  await pool.query(`UPDATE realtime_voice_session SET status='ended',"startedAt"=$2,"endedAt"=$3 WHERE id=$1`, [
    sessionId,
    startedAt,
    endedAt
  ])
  assert.equal(
    (
      await pool.query(
        `UPDATE realtime_voice_task SET status='completed',result='done' WHERE id=$1 AND status='running'`,
        [taskId]
      )
    ).rowCount,
    1
  )
  // Repeating the platform's entity sync must preserve call history, task results and transcripts.
  await dataSource.synchronize()
  assert.equal((await dataSource.driver.createSchemaBuilder().log()).upQueries.length, 0)
  assert.deepEqual(
    (await pool.query('SELECT "startedAt","endedAt",status FROM realtime_voice_session WHERE id=$1', [sessionId]))
      .rows[0],
    { startedAt, endedAt, status: 'ended' }
  )
  assert.deepEqual((await pool.query('SELECT status,result FROM realtime_voice_task WHERE id=$1', [taskId])).rows[0], {
    status: 'completed',
    result: 'done'
  })
  assert.equal((await pool.query('SELECT id FROM realtime_voice_turn WHERE "sessionId"=$1', [sessionId])).rowCount, 2)
  const session = await dataSource.getRepository(RealtimeVoiceSession).findOneByOrFail({ id: sessionId })
  assert.equal(session.startedAt.getTime(), startedAt.getTime())
  assert.equal(session.endedAt.getTime(), endedAt.getTime())
  assert.deepEqual(session.scope, scope)
  assert.deepEqual(session.usageReceipts, { 'response.with.dots': { inputAudio: 123, outputAudio: 456 } })
  console.log(
    'PASS: actual voice/base entity synchronization and repeat sync without drift, nullable call timing and retained history, concurrent call deduplication and single claim, cancellation, transcript uniqueness, inherited foreign keys and required columns, usage receipts, scope filtering, repository round-trip'
  )
} finally {
  try {
    if (dataSource?.isInitialized) await dataSource.destroy()
  } finally {
    try {
      await pool?.end()
    } finally {
      try {
        docker('rm', '--force', container)
      } catch {
        /* Container may not have started. */
      }
    }
  }
}
