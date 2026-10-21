// Real PostgreSQL acceptance. No database means failure, never a silently skipped pass.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { randomBytes, createHash } = require('node:crypto')
const ts = require('typescript')
const { DataSource, EntitySchema } = require('typeorm')
const { verifyLegacyAdoption } = require('./schema-migration-legacy-fixture.cjs')
const root = path.resolve(__dirname, '../..')
const silent = {
  log() {},
  logMigration() {},
  logSchemaBuild() {},
  logQuery() {},
  logQueryError() {},
  logQuerySlow() {}
}

async function main() {
  await fs.mkdir(path.join(root, '.nx'), { recursive: true })
  const temporary = await fs.mkdtemp(path.join(root, '.nx/schema-migration-test-'))
  const program = ts.createProgram(
    [
      path.join(root, 'packages/server/src/database/schema-migration.ts'),
      path.join(root, 'packages/server/src/database/application-data-source.ts'),
      path.join(root, 'apps/api/src/schema-migrations.ts')
    ],
    {
      rootDir: root,
      outDir: temporary,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      skipLibCheck: true,
      strictNullChecks: true,
      noEmitOnError: true
    }
  )
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (file) => file,
      getNewLine: () => '\n'
    })
  )
  program.emit()
  const { synchronizeWithMigrations, withSchemaLock, SCHEMA_LOCK_KEY } = require(
    path.join(temporary, 'packages/server/src/database/schema-migration.js')
  )
  const { loadSchemaMigrations } = require(path.join(temporary, 'apps/api/src/schema-migrations.js'))
  const { initializeApplicationDataSource } = require(
    path.join(temporary, 'packages/server/src/database/application-data-source.js')
  )
  const container = `xpert-schema-test-${randomBytes(6).toString('hex')}`
  const password = randomBytes(24).toString('hex')
  const docker = (...args) =>
    execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, POSTGRES_PASSWORD: password }
    }).trim()
  let admin,
    started = false
  const sources = []
  try {
    docker(
      'run',
      '--rm',
      '-d',
      '--name',
      container,
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD',
      '--tmpfs',
      '/var/lib/postgresql/data',
      'pgvector/pgvector:pg15'
    )
    started = true
    const options = {
      type: 'postgres',
      host: '127.0.0.1',
      port: Number(docker('port', container, '5432/tcp').split(':').at(-1)),
      username: 'postgres',
      password,
      database: 'postgres',
      synchronize: false,
      migrationsRun: false,
      installExtensions: false,
      uuidExtension: 'pgcrypto',
      logger: silent
    }
    for (let i = 0; i < 60; i++) {
      admin = new DataSource(options)
      try {
        await admin.initialize()
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
    assert.ok(admin.isInitialized, 'PostgreSQL must start')
    await admin.query('CREATE DATABASE fixture')
    const entity = (extra = false) => [
      new EntitySchema({
        name: 'Owned',
        tableName: 'sql_owned',
        columns: {
          id: { type: Number, primary: true },
          must_not_be_synced: { type: String, nullable: true }
        }
      }),
      new EntitySchema({
        name: 'Ordinary',
        tableName: 'ordinary',
        columns: {
          id: { type: Number, primary: true },
          ownedId: { type: Number, nullable: true },
          ...(extra ? { label: { type: String, default: 'new' } } : {})
        },
        foreignKeys: [{ target: 'Owned', columnNames: ['ownedId'], referencedColumnNames: ['id'] }]
      })
    ]
    const connect = async (entities, database = 'fixture', logger = silent) => {
      const source = new DataSource({ ...options, database, entities, logger })
      await source.initialize()
      sources.push(source)
      return source
    }
    const source = await connect(entity())
    const constraintCheck =
      "SELECT 'owned-check' AS missing WHERE NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='sql_owned'::regclass AND conname='owned_positive')"
    const bundle = {
      managedTables: ['sql_owned'],
      checks: [constraintCheck],
      migrations: [
        {
          id: 'owned-base',
          name: 'OwnedBase1792454400000',
          phase: 'before-sync',
          baseline: true,
          sql: 'CREATE TABLE sql_owned(id integer PRIMARY KEY, CONSTRAINT owned_positive CHECK(id>0))',
          check: constraintCheck
        },
        {
          id: 'owned-data',
          name: 'OwnedData1792454401000',
          phase: 'after-sync',
          baseline: true,
          sql: 'INSERT INTO sql_owned VALUES(1)',
          check: "SELECT 'owned-data' AS missing WHERE NOT EXISTS(SELECT 1 FROM sql_owned WHERE id=1)"
        }
      ]
    }
    for (const sql of [
      'BEGIN; CREATE TABLE unsafe(id int); COMMIT;',
      'CREATE INDEX CONCURRENTLY unsafe ON ordinary(id)'
    ]) {
      await assert.rejects(
        () =>
          synchronizeWithMigrations(source, {
            ...bundle,
            migrations: [{ ...bundle.migrations[0], sql }]
          }),
        /UNSUPPORTED_TRANSACTION_CONTROL/
      )
    }
    await synchronizeWithMigrations(source, bundle)
    await source.query('INSERT INTO ordinary(id,"ownedId") VALUES(1,1)')
    await synchronizeWithMigrations(source, bundle)
    assert.equal((await source.query('SELECT count(*)::int AS n FROM sql_owned'))[0].n, 1)
    assert.equal(
      (await source.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='sql_owned'"))[0]
        .n,
      1
    )
    const evolved = await connect(entity(true))
    await synchronizeWithMigrations(evolved, bundle)
    assert.equal((await evolved.query('SELECT label FROM ordinary WHERE id=1'))[0].label, 'new')
    await synchronizeWithMigrations(evolved, bundle, 'verify')
    console.log('PASS native TypeORM migrations, ordinary-table evolution, cross-owner FK and SQL-table exclusion')

    // A plugin may have installed tables before it becomes unavailable. Omitting
    // only its metadata must preserve those tables, rows, indexes and constraints.
    const optionalPlugin = (recovered = false) =>
      new EntitySchema({
        name: 'OptionalPlugin',
        tableName: 'optional_plugin',
        columns: {
          id: { type: Number, primary: true },
          ordinaryId: { type: Number },
          payload: { type: 'jsonb' },
          ...(recovered ? { label: { type: String, default: 'recovered' } } : {})
        },
        foreignKeys: [{ target: 'Ordinary', columnNames: ['ordinaryId'], referencedColumnNames: ['id'] }]
      })
    const withPlugin = await connect([...entity(true), optionalPlugin()])
    await synchronizeWithMigrations(withPlugin, bundle)
    await withPlugin.query(`
      INSERT INTO optional_plugin VALUES(7,1,'{"retained":true}');
      ALTER TABLE optional_plugin ADD CONSTRAINT plugin_positive CHECK (id > 0);
      CREATE INDEX plugin_payload ON optional_plugin USING gin(payload)
    `)
    const pluginStructure = async () => ({
      columns: await evolved.query(
        "SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_name='optional_plugin' ORDER BY ordinal_position"
      ),
      constraints: await evolved.query(
        "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='optional_plugin'::regclass ORDER BY conname"
      ),
      indexes: await evolved.query(
        "SELECT indexname,indexdef FROM pg_indexes WHERE tablename='optional_plugin' ORDER BY indexname"
      )
    })
    const pluginBefore = await pluginStructure()
    for (const action of ['apply', 'apply', 'verify']) {
      await synchronizeWithMigrations(evolved, bundle, action)
      assert.deepEqual(await pluginStructure(), pluginBefore)
      assert.deepEqual(await evolved.query('SELECT * FROM optional_plugin'), [
        { id: 7, ordinaryId: 1, payload: { retained: true } }
      ])
    }
    const recoveredPlugin = await connect([...entity(true), optionalPlugin(true)])
    await synchronizeWithMigrations(recoveredPlugin, bundle)
    assert.deepEqual(await recoveredPlugin.query('SELECT payload,label FROM optional_plugin'), [
      { payload: { retained: true }, label: 'recovered' }
    ])
    await assert.rejects(
      () =>
        connect([
          ...entity(true),
          new EntitySchema({
            name: 'DependentPlugin',
            tableName: 'dependent_plugin',
            columns: { id: { type: Number, primary: true }, pluginId: { type: Number } },
            foreignKeys: [{ target: 'OptionalPlugin', columnNames: ['pluginId'], referencedColumnNames: ['id'] }]
          })
        ]),
      /was not found/
    )
    assert.equal((await evolved.query("SELECT to_regclass('dependent_plugin') AS name"))[0].name, null)
    console.log(
      'PASS unavailable plugin tables survive repeated migration, recover later, and missing entity references block DDL'
    )

    const branch = {
      ...bundle,
      migrations: [
        ...bundle.migrations,
        {
          id: 'older-branch',
          name: 'OlderBranch1792454399000',
          phase: 'after-sync',
          baseline: false,
          sql: 'INSERT INTO sql_owned VALUES(2)',
          check: 'SELECT NULL::text AS missing WHERE false'
        }
      ]
    }
    const concurrent = await connect(entity(true))
    await Promise.all([synchronizeWithMigrations(evolved, branch), synchronizeWithMigrations(concurrent, branch)])
    assert.equal((await evolved.query('SELECT count(*)::int AS n FROM sql_owned'))[0].n, 2)
    const failed = {
      ...branch,
      migrations: [
        ...branch.migrations,
        {
          id: 'failure',
          name: 'Failure1792454402000',
          phase: 'after-sync',
          baseline: false,
          sql: 'CREATE TABLE rollback_probe(id int); SELECT 1/0',
          check: 'SELECT NULL::text AS missing WHERE false'
        }
      ]
    }
    await assert.rejects(() => synchronizeWithMigrations(evolved, failed), /22012/)
    assert.equal((await evolved.query("SELECT to_regclass('rollback_probe') AS name"))[0].name, null)
    const changed = {
      ...branch,
      migrations: branch.migrations.map((migration, index) =>
        index === 0 ? { ...migration, sql: migration.sql + '; SELECT 1' } : migration
      )
    }
    await assert.rejects(() => synchronizeWithMigrations(evolved, changed), /MIGRATION_CHECKSUM_MISMATCH/)
    await assert.rejects(
      () => synchronizeWithMigrations(evolved, { ...branch, managedTables: [] }),
      /SQL_TABLE_OWNERSHIP_REMOVED/
    )
    console.log('PASS concurrent deployments, older migration, transactional rollback and immutable SQL ownership')

    await evolved.query('ALTER TABLE sql_owned DROP CONSTRAINT owned_positive')
    await assert.rejects(() => synchronizeWithMigrations(evolved, branch), /SCHEMA_VERIFICATION_FAILED/)
    assert.equal((await evolved.query('SELECT count(*)::int AS n FROM sql_owned'))[0].n, 2)
    await evolved.query('ALTER TABLE sql_owned ADD CONSTRAINT owned_positive CHECK(id>0)')
    await evolved.query('DROP TABLE xpert_schema_migrations,xpert_schema_migration_checksums')
    await assert.rejects(() => synchronizeWithMigrations(evolved, bundle), /BASELINE_REQUIRED/)
    await evolved.query('ALTER TABLE sql_owned DROP CONSTRAINT owned_positive')
    await assert.rejects(() => synchronizeWithMigrations(evolved, bundle, 'baseline'), /SCHEMA_VERIFICATION_FAILED/)
    assert.equal((await evolved.query("SELECT to_regclass('xpert_schema_migrations') AS name"))[0].name, null)
    assert.equal((await evolved.query('SELECT count(*)::int AS n FROM xpert_schema_migration_checksums'))[0].n, 0)
    await evolved.query('ALTER TABLE sql_owned ADD CONSTRAINT owned_positive CHECK(id>0)')
    await synchronizeWithMigrations(evolved, bundle, 'baseline')
    await synchronizeWithMigrations(evolved, bundle)
    assert.equal((await evolved.query('SELECT count(*)::int AS n FROM sql_owned'))[0].n, 2)
    console.log('PASS structure drift blocks rollout; verified TypeORM baseline preserves existing rows')

    const lock = evolved.createQueryRunner()
    await lock.query('SELECT pg_advisory_lock($1,$2)', [...SCHEMA_LOCK_KEY])
    let completed = false
    const waiting = withSchemaLock(concurrent, async () => {
      completed = true
    })
    try {
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(completed, false)
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1,$2)', [...SCHEMA_LOCK_KEY])
      await lock.release()
    }
    await waiting
    console.log('PASS host and legacy-plugin DDL share a PostgreSQL session lock')

    const assets = path.join(temporary, 'database-migrations')
    for (const [name, input] of [
      ['core', 'packages/server/src'],
      ['ai', 'packages/server-ai/src']
    ]) {
      const scan = async (relative = '') => {
        for (const entry of await fs.readdir(path.join(root, input, relative), { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name === 'node_modules') continue
          const directory = path.join(relative, entry.name)
          if (entry.name === 'migrations')
            await fs.cp(path.join(root, input, directory), path.join(assets, name, directory), { recursive: true })
          else await scan(directory)
        }
      }
      await scan()
    }
    for (const name of ['current.sql', 'types.sql'])
      await fs.copyFile(
        path.join(root, 'packages/server/src/database/platform-baseline', name),
        path.join(assets, 'core/database/platform-baseline', name)
      )
    await fs.copyFile(
      path.join(root, '.deploy/api/database-migrations.json'),
      path.join(assets, 'database-migrations.json')
    )
    const hostBundle = await loadSchemaMigrations(assets)
    assert.ok(hostBundle.migrations.length > 0)
    require('reflect-metadata')
    process.env.DB_TYPE = 'postgres'
    require('ts-node').register({
      project: path.join(root, 'tsconfig.base.json'),
      transpileOnly: true,
      compilerOptions: { module: 'commonjs' }
    })
    require('tsconfig-paths').register({
      baseUrl: root,
      paths: require(path.join(root, 'tsconfig.base.json')).compilerOptions.paths
    })
    const { coreEntities } = require(path.join(root, 'packages/server/src/core/entities'))
    const { ALL_AI_ENTITIES } = require(path.join(root, 'packages/server-ai/src/core/entities'))
    const host = await connect([...coreEntities, ...ALL_AI_ENTITIES], 'postgres', {
      ...silent,
      logQueryError: (error, query) => console.error(String(error).slice(0, 300), query.slice(0, 300))
    })
    await synchronizeWithMigrations(host, hostBundle)
    await synchronizeWithMigrations(host, hostBundle)
    await synchronizeWithMigrations(host, hostBundle, 'verify')
    for (const environment of ['development', 'production']) {
      const previous = process.env.NODE_ENV
      process.env.NODE_ENV = environment
      try {
        const startup = await initializeApplicationDataSource(
          {
            ...options,
            entities: [...coreEntities, ...ALL_AI_ENTITIES],
            synchronize: true,
            migrationsRun: true,
            dropSchema: true,
            installExtensions: true
          },
          (config) => new DataSource(config)
        )
        sources.push(startup)
        await synchronizeWithMigrations(startup, hostBundle, 'verify')
      } finally {
        if (previous === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = previous
      }
    }
    console.log('PASS development and production API initialization preserve all SQL-managed constraints')
    await host.query('DROP TABLE xpert_schema_migrations,xpert_schema_migration_checksums')
    await synchronizeWithMigrations(host, hostBundle, 'baseline')
    await synchronizeWithMigrations(host, hostBundle)
    await synchronizeWithMigrations(host, hostBundle, 'verify')
    await host.query('ALTER TABLE xpert_project_pipeline_instance DROP CONSTRAINT pipeline_instance_project_fk')
    await assert.rejects(() => synchronizeWithMigrations(host, hostBundle), /SCHEMA_VERIFICATION_FAILED/)
    assert.equal(
      (await host.query('SELECT count(*)::int AS n FROM xpert_schema_migrations'))[0].n,
      hostBundle.migrations.length
    )
    console.log(
      'PASS complete host installation and adoption, repeat synchronization, packaged SQL discovery and Pipeline drift rejection'
    )

    // Reconstruct the pre-runner deployment path, independently of the new baseline SQL.
    // The inventory pins the historical scripts, so this is not a freshly migrated DB with its history deleted.
    await admin.query('CREATE DATABASE legacy')
    const legacy = await connect([...coreEntities, ...ALL_AI_ENTITIES], 'legacy')
    await legacy.query('CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector')
    await legacy.synchronize()
    const inventory = JSON.parse(
      await fs.readFile(path.join(root, 'packages/server/src/database/platform-baseline/legacy-inventory.json'), 'utf8')
    )
    for (const entry of inventory) {
      const sql = await fs.readFile(path.join(root, entry.source), 'utf8')
      assert.equal(createHash('sha256').update(sql).digest('hex'), entry.sha256, entry.source)
      try {
        await legacy.query(sql)
      } catch (error) {
        throw new Error(`${entry.source}: ${error.message}`)
      }
    }
    await verifyLegacyAdoption(legacy, hostBundle, synchronizeWithMigrations)
    console.log('PASS legacy Entity synchronization + 38 original SQL scripts -> baseline -> apply -> verify')
  } finally {
    for (const source of sources) if (source.isInitialized) await source.destroy()
    if (admin?.isInitialized) await admin.destroy()
    if (started) docker('rm', '-f', container)
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
