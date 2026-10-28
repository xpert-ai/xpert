const assert = require('node:assert/strict')
const { EntitySchema } = require('typeorm')

async function verifyCatalogRevisions(admin, connect, hostBundle, synchronizeWithMigrations) {
  const migration = hostBundle.migrations.find((item) => item.id.endsWith('20261027000000-content-revision-capacity'))
  assert.ok(migration, 'The catalog capacity migration must be packaged')
  assert.equal(migration.phase, 'before-sync')
  const bundle = { managedTables: [], migrations: [migration], checks: [migration.check] }
  const entity = new EntitySchema({
    name: 'CatalogRevision',
    tableName: 'content_resource_entry',
    columns: {
      id: { type: Number, primary: true },
      sourceRevision: { type: 'varchar', length: 256, nullable: true }
    }
  })
  for (const legacy of [true, false]) {
    const database = legacy ? 'catalog_revision_upgrade' : 'catalog_revision_fresh'
    await admin.query(`CREATE DATABASE ${database}`)
    const source = await connect([entity], database)
    const oldRevision = 'legacy-'.repeat(28)
    if (legacy) {
      await source.query('CREATE TABLE content_resource_entry(id int PRIMARY KEY, "sourceRevision" varchar(200))')
      await source.query('INSERT INTO content_resource_entry VALUES(1,$1)', [oldRevision])
    }
    await synchronizeWithMigrations(source, bundle)
    if (legacy) {
      assert.deepEqual(await source.query('SELECT "sourceRevision" FROM content_resource_entry WHERE id=1'), [
        { sourceRevision: oldRevision }
      ])
    }
    const revision = 'r'.repeat(256)
    await source.query('INSERT INTO content_resource_entry VALUES(2,$1)', [revision])
    const expected = await source.query('SELECT * FROM content_resource_entry ORDER BY id')
    await synchronizeWithMigrations(source, bundle)
    await synchronizeWithMigrations(source, bundle, 'verify')
    assert.deepEqual(await source.query('SELECT * FROM content_resource_entry ORDER BY id'), expected)
    await assert.rejects(source.query('INSERT INTO content_resource_entry VALUES(3,$1)', ['r'.repeat(257)]), {
      code: '22001'
    })
  }
  console.log('PASS catalog revision expansion preserves old values, accepts 256 characters, and is repeatable')
}

module.exports = { verifyCatalogRevisions }
