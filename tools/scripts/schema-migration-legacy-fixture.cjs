// Representative persisted calls after the historical ModelExecution migration.
// Use real host tables and foreign keys; baseline adoption must not rewrite these rows.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

async function seedLegacyCalls(source) {
  const [{ id: tenantId }] = await source.query(
    `INSERT INTO tenant(name) VALUES('schema-upgrade-fixture') RETURNING id`
  )
  const [{ id: userId }] = await source.query(
    `INSERT INTO "user"("tenantId", email) VALUES($1,'schema-upgrade@example.invalid') RETURNING id`,
    [tenantId]
  )
  const [{ id: organizationId }] = await source.query(
    `INSERT INTO organization("tenantId",name,currency,"defaultValueDateType")
     VALUES($1,'schema-upgrade-fixture','USD','TODAY') RETURNING id`,
    [tenantId]
  )
  const context = {
    tenantId,
    runtimeOrganizationId: organizationId,
    actorUserId: userId,
    billableUserId: userId,
    xpertId: randomUUID(),
    assistantVersion: '1',
    conversationId: randomUUID(),
    source: { type: 'cli_session', cliSessionId: randomUUID() },
    environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'fixture' },
    tool: { id: 'fixture', version: '1.0.0' }
  }
  const model = {
    id: 'fixture',
    copilotId: randomUUID(),
    providerScopeId: randomUUID(),
    providerOrganizationId: null,
    provider: 'fixture',
    model: 'fixture',
    modelType: 'llm',
    capabilities: [],
    protocols: ['openai_chat']
  }
  const limits = { maxConcurrentRequests: 1, requestsPerMinute: 10, leaseSeconds: 60, maxDurationSeconds: 120 }
  const [{ id: grantId }] = await source.query(
    `INSERT INTO model_execution_grant("tenantId","organizationId","ownerId","credentialHash",
      context,models,"defaultModelId",limits,"expiresAt","absoluteExpiresAt")
     VALUES($1,$2,$3,$4,$5,$6,'fixture',$7,now()+interval '1 minute',now()+interval '2 minutes') RETURNING id`,
    [
      tenantId,
      organizationId,
      userId,
      'synthetic-upgrade-fixture',
      JSON.stringify(context),
      JSON.stringify([model]),
      JSON.stringify(limits)
    ]
  )
  for (const [status, errorCode, dispatched, reserved] of [
    ['started', null, false, 100],
    ['failed', 'execution_preflight_failed', false, 0],
    ['failed', 'worker_lost', false, 0],
    ['succeeded', null, true, 0],
    ['settlement_pending', null, true, 100]
  ]) {
    await source.query(
      `INSERT INTO model_gateway_call("tenantId","organizationId","userId",source,"grantId",
      "requestId","callId","externalModelId",provider,model,status,"startedAt","dispatchedAt","reservedTokens",
      "errorCode","completedAt")
      VALUES($1,$2,$3,'execution_grant',$4,$5,$6,'fixture','fixture','fixture',$7::varchar,now(),
        CASE WHEN $8 THEN now() ELSE NULL END,$9,$10,CASE WHEN $7::varchar='started' THEN NULL ELSE now() END)`,
      [tenantId, organizationId, userId, grantId, randomUUID(), randomUUID(), status, dispatched, reserved, errorCode]
    )
  }
}

const readCalls = (source) => source.query('SELECT to_jsonb(c) AS row FROM model_gateway_call c ORDER BY id')

async function verifyLegacyAdoption(source, bundle, migrate) {
  await seedLegacyCalls(source)
  const before = await readCalls(source)
  await assert.rejects(() => migrate(source, bundle), /BASELINE_REQUIRED/)

  const [{ definition }] = await source.query(`SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid='model_execution_grant'::regclass
    AND conname='model_execution_grant_status_check'`)
  await source.query('ALTER TABLE model_execution_grant DROP CONSTRAINT model_execution_grant_status_check')
  await assert.rejects(
    () => migrate(source, bundle, 'baseline'),
    /constraint:model_execution_grant.model_execution_grant_status_check/
  )
  assert.equal((await source.query("SELECT to_regclass('xpert_schema_migrations') AS name"))[0].name, null)
  await source.query(
    `ALTER TABLE model_execution_grant ADD CONSTRAINT model_execution_grant_status_check ${definition}`
  )

  // A missing dispatch marker with upstream/settlement evidence still needs review.
  const [{ id }] = await source.query(
    `SELECT id FROM model_gateway_call WHERE "errorCode"='execution_preflight_failed'`
  )
  for (const mutation of ["status='settlement_pending'", '"totalTokens"=1', `"usageFact"='{}'::jsonb`]) {
    await source.query(`UPDATE model_gateway_call SET ${mutation} WHERE id=$1`, [id])
    await assert.rejects(() => migrate(source, bundle, 'baseline'), /legacy:model-execution-dispatch-needs-review/)
    assert.equal((await source.query("SELECT to_regclass('xpert_schema_migrations') AS name"))[0].name, null)
    assert.equal((await source.query('SELECT count(*)::int AS n FROM xpert_schema_migration_checksums'))[0].n, 0)
    await source.query(`UPDATE model_gateway_call SET status='failed',"totalTokens"=0,"usageFact"=NULL WHERE id=$1`, [
      id
    ])
  }

  await migrate(source, bundle, 'baseline')
  assert.deepEqual(await readCalls(source), before)
  assert.equal(
    (await source.query('SELECT count(*)::int AS n FROM xpert_schema_migrations'))[0].n,
    bundle.migrations.filter((migration) => migration.baseline).length
  )
  await assert.rejects(() => migrate(source, bundle, 'verify'), /MIGRATIONS_PENDING/)
  await migrate(source, bundle)
  await migrate(source, bundle, 'verify')
  await migrate(source, bundle)
  await migrate(source, bundle, 'verify')
  assert.deepEqual(await readCalls(source), before)
  assert.equal(
    (await source.query('SELECT count(*)::int AS n FROM xpert_schema_migrations'))[0].n,
    bundle.migrations.length
  )
  await assert.rejects(() => source.query(`UPDATE model_execution_grant SET status='invalid'`), /check constraint/)
  console.log(
    'PASS old DB adoption preserves admitted/failed/dispatched calls; inconsistent evidence rolls back; upgrade is repeatable'
  )
}

module.exports = { verifyLegacyAdoption }
