// Real legacy variants must be adopted without weakening columns or rewriting immutable checksums.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

async function verifyLegacyCompatibility(source, bundle, migrate, root) {
  const sql = await fs.readFile(path.join(root, 'packages/server/src/database/platform-baseline/current.sql'), 'utf8')
  const catalog = JSON.parse(sql.split('$catalog$')[1])
  const variants = catalog.columns.filter(
    (column) => column.allowNotNull || column.typeAlternatives || column.defaultAlternatives
  )
  assert.equal(variants.length, 48)
  await source.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
  for (const column of variants) {
    const target = `"${column.table}" ALTER COLUMN "${column.name}"`
    if (column.allowNotNull) await source.query(`ALTER TABLE ${target} SET NOT NULL`)
    if (column.typeAlternatives) await source.query(`ALTER TABLE ${target} TYPE timestamp with time zone`)
    if (column.defaultAlternatives) await source.query(`ALTER TABLE ${target} SET DEFAULT uuid_generate_v4()`)
  }
  const columns = () =>
    source.query(
      `SELECT c.relname,a.attname,a.attnotnull,
    format_type(a.atttypid,a.atttypmod) AS type,pg_get_expr(d.adbin,d.adrelid) AS expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname=current_schema() AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
    AND c.relname=ANY($1::text[]) ORDER BY c.relname,a.attname`,
      [[...new Set(variants.map((column) => column.table))]]
    )
  const before = await columns()
  await assert.rejects(
    () => migrate(source, { ...bundle, baselineChecks: undefined }, 'baseline'),
    /SCHEMA_VERIFICATION_FAILED/
  )
  assert.equal((await source.query("SELECT to_regclass('xpert_schema_migrations') AS name"))[0].name, null)

  // Compatibility is column-specific, never a global permission to ignore nullability or types.
  await source.query('ALTER TABLE assistant_template_publication ALTER COLUMN "createdAt" DROP NOT NULL')
  await assert.rejects(() => migrate(source, bundle, 'baseline'), /column:assistant_template_publication.createdAt/)
  await source.query('ALTER TABLE assistant_template_publication ALTER COLUMN "createdAt" SET NOT NULL')
  await source.query('ALTER TABLE xpert_project_pipeline_instance ALTER COLUMN "deletedAt" TYPE date')
  await assert.rejects(() => migrate(source, bundle, 'baseline'), /column:xpert_project_pipeline_instance.deletedAt/)
  await source.query(
    'ALTER TABLE xpert_project_pipeline_instance ALTER COLUMN "deletedAt" TYPE timestamp with time zone'
  )
  await source.query('ALTER TABLE template_installation ALTER COLUMN id DROP DEFAULT')
  await assert.rejects(() => migrate(source, bundle, 'baseline'), /column:template_installation.id/)
  await source.query('ALTER TABLE template_installation ALTER COLUMN id SET DEFAULT uuid_generate_v4()')
  assert.deepEqual(await columns(), before)
  return async () => {
    assert.deepEqual(await columns(), before)
    // An explicit adoption check is still enforced after history exists.
    await assert.rejects(
      () => migrate(source, { ...bundle, baselineChecks: ["SELECT 'fixture-drift' AS missing"] }, 'baseline'),
      /fixture-drift/
    )
    await assert.rejects(() => migrate(source, { ...bundle, baselineChecks: [] }, 'baseline'), /EMPTY_BASELINE_CHECKS/)
    await assert.rejects(
      () => migrate(source, { ...bundle, baselineChecks: ['DELETE FROM tenant'] }, 'baseline'),
      /INVALID_VERIFICATION_SQL/
    )
    const changed = {
      ...bundle,
      migrations: bundle.migrations.map((entry, index) =>
        index ? entry : { ...entry, check: entry.check + '\n-- edited' }
      )
    }
    await assert.rejects(() => migrate(source, changed, 'verify'), /MIGRATION_CHECKSUM_MISMATCH/)
    console.log(
      'PASS 48 explicit legacy column variants survive adoption/upgrade; incompatible drift and checksum edits remain blocked'
    )
  }
}

module.exports = { verifyLegacyCompatibility }
