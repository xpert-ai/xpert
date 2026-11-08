const assert = require('node:assert/strict')

async function verifyArtifactGrantMigrations(admin, connect, hostBundle, synchronizeWithMigrations) {
  const migrations = hostBundle.migrations.filter((item) => item.id.startsWith('core.artifact-use-grants.'))
  const prerequisite = migrations.find((item) => item.id.endsWith('20261108000200-artifact-grant-uuid-extension'))
  assert.ok(prerequisite, 'The UUID extension prerequisite must be packaged')
  assert.equal(prerequisite.phase, 'before-sync')
  assert.ok(hostBundle.checks.includes(prerequisite.check), 'Startup verification must check the extension')
  const tables = ['artifact_use_grant', 'artifact_use_grant_audit', 'artifact_reference', 'resource_analysis_execution']
  const bundle = { managedTables: tables, migrations, checks: migrations.map((item) => item.check) }
  const previous = {
    ...bundle,
    migrations: migrations.filter((item) => item !== prerequisite),
    checks: bundle.checks.filter((check) => check !== prerequisite.check)
  }
  for (const existing of [false, true]) {
    const database = existing ? 'artifact_grants_upgrade' : 'artifact_grants_fresh'
    await admin.query(`CREATE DATABASE ${database}`)
    // No ORM metadata or automatic extension installation may prepare the fixture.
    const source = await connect([], database)
    assert.deepEqual(await source.query("SELECT to_regprocedure('uuid_generate_v4()') AS function"), [
      { function: null }
    ])
    await source.query(`
      CREATE EXTENSION pgcrypto;
      CREATE TABLE tenant(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE organization(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE "user"(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      INSERT INTO tenant DEFAULT VALUES;
      INSERT INTO organization DEFAULT VALUES;
      INSERT INTO "user" DEFAULT VALUES;
    `)
    if (existing) await source.query('CREATE EXTENSION "uuid-ossp"')
    await synchronizeWithMigrations(source, existing ? previous : bundle)
    const history = await source.query('SELECT * FROM xpert_schema_migration_checksums ORDER BY name')
    const extension = await source.query("SELECT oid FROM pg_extension WHERE extname = 'uuid-ossp'")
    // Leave every grant/reference/analysis ID to the real SQL default.
    await source.query(`
      INSERT INTO artifact_use_grant (
        "tenantId", "organizationId", "artifactId", "versionId", "ownerProjectId",
        "targetProjectId", "targetGroupId", "issuedById", "expiresAt"
      ) SELECT tenant.id, organization.id, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        gen_random_uuid(), gen_random_uuid(), "user".id, now() + interval '1 day'
        FROM tenant, organization, "user";
      INSERT INTO artifact_use_grant_audit ("tenantId", "organizationId", "grantId", "actorId", event, revision)
        SELECT "tenantId", "organizationId", id, "issuedById", 'offered', revision FROM artifact_use_grant;
      INSERT INTO artifact_reference (
        "tenantId", "organizationId", "projectId", "artifactId", "versionId", "groupId", "useGrantId", title
      ) SELECT "tenantId", "organizationId", "targetProjectId", "artifactId", "versionId", "targetGroupId", id,
        'Retained reference' FROM artifact_use_grant;
      INSERT INTO resource_analysis_execution (
        "tenantId", "organizationId", "grantId", "referenceId", "groupId", "actorId", "assistantId",
        "executionId", "grantRevision", "datasetKey", "queryHash", status
      ) SELECT g."tenantId", g."organizationId", g.id, r.id, g."targetGroupId", g."issuedById", gen_random_uuid(),
        gen_random_uuid(), g.revision, 'fixture', repeat('a', 64), 'succeeded'
        FROM artifact_use_grant g JOIN artifact_reference r ON r."useGrantId" = g.id;
    `)
    const rows = () =>
      Promise.all(tables.map((table) => source.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)))
    const before = await rows()
    for (const result of before) {
      assert.equal(result.length, 1)
      assert.match(result[0].row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
    await synchronizeWithMigrations(source, bundle)
    await synchronizeWithMigrations(source, bundle)
    await synchronizeWithMigrations(source, bundle, 'verify')
    assert.deepEqual(await rows(), before)
    assert.deepEqual(await source.query("SELECT oid FROM pg_extension WHERE extname = 'uuid-ossp'"), extension)
    assert.deepEqual(
      await source.query('SELECT * FROM xpert_schema_migration_checksums WHERE name = ANY($1::text[]) ORDER BY name', [
        history.map((row) => row.name)
      ]),
      history
    )
  }
  console.log(
    'PASS grant migrations install UUID prerequisites on fresh databases and preserve existing rows/checksums'
  )
}

module.exports = { verifyArtifactGrantMigrations }
