// Isolated PostgreSQL regression for legacy default assignments; never uses the configured business database.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const container = `xpert-default-model-test-${randomUUID().slice(0, 8)}`
const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../packages/server-ai/src/copilot/migrations/20261031015000-migrate-legacy-default-models.sql'
  ),
  'utf8'
)
const check = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../packages/server-ai/src/copilot/migrations/checks/20261031015000-migrate-legacy-default-models.sql'
  ),
  'utf8'
)
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const sql = (input) =>
  execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-h', '127.0.0.1', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim()
const quote = (value) => (value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`)
const tenant = randomUUID()
const org = randomUUID()
let started = false
async function main() {
  try {
    docker(
      'run',
      '--rm',
      '-d',
      '--name',
      container,
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '--tmpfs',
      '/var/lib/postgresql/data',
      'pgvector/pgvector:pg15'
    )
    started = true
    let ready = false
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        docker('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres')
        ready = true
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
    assert.ok(ready, 'PostgreSQL must be ready')
    sql(`CREATE TABLE copilot_model (id uuid PRIMARY KEY, model varchar, "modelType" varchar, options json);
      CREATE TABLE copilot (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, role varchar, enabled boolean,
        "createdAt" timestamptz DEFAULT now(), "copilotModelId" uuid REFERENCES copilot_model(id));
      CREATE TABLE copilot_role_default (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, "tenantId" uuid, "organizationId" uuid,
        "scopeKey" varchar NOT NULL, role varchar NOT NULL, mode varchar NOT NULL, binding json,
        UNIQUE ("tenantId", "scopeKey", role));`)
    const seed = (role, modelType, scope = org, options = null, overrides = {}) => {
      const id = randomUUID()
      const modelId = randomUUID()
      const model = overrides.model ?? `synthetic-${role}`
      sql(`INSERT INTO copilot_model VALUES (${quote(modelId)}, ${quote(model)}, ${quote(modelType)}, ${quote(options === null ? null : JSON.stringify(options))});
        INSERT INTO copilot VALUES (${quote(id)}, ${quote(overrides.tenant ?? tenant)}, ${quote(scope)}, ${quote(role)}, ${overrides.enabled ?? true}, ${quote(overrides.createdAt ?? '2026-01-01T00:00:00Z')}, ${quote(modelId)});`)
      return { copilotId: id, model, modelType, options: options ?? {} }
    }
    const primary = seed('primary', 'llm', org, { temperature: 0, stream: false, optional: null })
    const secondary = seed('secondary', 'llm')
    const reasoning = seed('reasoning', 'llm')
    const embedding = seed('embedding', 'text-embedding')
    const tenantPrimary = seed('primary', 'llm', null)
    seed('primary', 'llm', org, {}, { createdAt: '2026-02-01T00:00:00Z', model: 'later-duplicate' })
    const otherTenant = randomUUID()
    const separate = seed('primary', 'llm', org, {}, { tenant: otherTenant })
    const invalidScope = randomUUID()
    seed('embedding', 'llm', invalidScope)
    seed('primary', 'llm', invalidScope, { invalid: { nested: true } })
    seed('secondary', 'llm', invalidScope, null, { model: '  ' })
    seed('reasoning', 'llm', invalidScope, null, { enabled: false })
    // A later valid duplicate must not silently replace the invalid first legacy choice.
    seed('primary', 'llm', invalidScope, {}, { createdAt: '2026-02-01T00:00:00Z' })
    seed('realtime', 'realtime', invalidScope)
    const explicitScope = randomUUID()
    for (const [role, mode] of [
      ['primary', 'disabled'],
      ['secondary', 'inherit'],
      ['reasoning', 'fixed']
    ]) {
      seed(role, 'llm', explicitScope)
      sql(`INSERT INTO copilot_role_default ("tenantId", "organizationId", "scopeKey", role, mode, binding)
        VALUES (${quote(tenant)}, ${quote(explicitScope)}, ${quote(explicitScope)}, ${quote(role)}, ${quote(mode)}, ${mode === 'fixed' ? quote(JSON.stringify(primary)) : 'NULL'});`)
    }
    const legacyBefore = sql('SELECT json_agg(c ORDER BY id) FROM copilot c;')
    const modelsBefore = sql('SELECT json_agg(m ORDER BY id) FROM copilot_model m;')
    const read = () =>
      JSON.parse(
        sql('SELECT coalesce(json_agg(d ORDER BY "tenantId", "scopeKey", role), \'[]\') FROM copilot_role_default d;')
      )
    const existing = read()
    sql(`BEGIN; ${migration} COMMIT;`)
    const rows = read()
    assert.equal(sql(check), '')
    assert.equal(rows.length, 9)
    for (const [role, binding] of Object.entries({ primary, secondary, reasoning, embedding })) {
      assert.deepEqual(
        rows.find((row) => row.tenantId === tenant && row.scopeKey === org && row.role === role).binding,
        binding
      )
    }
    assert.deepEqual(rows.find((row) => row.scopeKey === 'tenant').binding, tenantPrimary)
    assert.deepEqual(rows.find((row) => row.tenantId === otherTenant).binding, separate)
    for (const row of existing)
      assert.deepEqual(
        rows.find((item) => item.id === row.id),
        row
      )
    assert.equal(
      rows.some((row) => row.scopeKey === invalidScope),
      false
    )
    sql(`BEGIN; ${migration} COMMIT;`)
    assert.deepEqual(read(), rows)
    assert.equal(sql('SELECT json_agg(c ORDER BY id) FROM copilot c;'), legacyBefore)
    assert.equal(sql('SELECT json_agg(m ORDER BY id) FROM copilot_model m;'), modelsBefore)
    console.log(
      'PASS: independent purposes, model types, tenant/organization scope, explicit settings, invalid legacy records, deterministic duplicates, options, repeat execution and source preservation'
    )
  } finally {
    if (started) docker('rm', '-f', container)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
