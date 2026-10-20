import { readFile, readdir, realpath } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { z } from 'zod'
import { SchemaMigrationBundle, SchemaSqlMigration } from '../../../packages/server/src/database/schema-migration'
import { validateSql } from '../../../packages/server/src/database/schema-migration-sql'

const configSchema = z
  .object({
    managedTables: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)),
    checks: z.array(z.string()),
    baseline: z.array(z.string())
  })
  .strict()
const componentSchema = z
  .object({ schemaVersion: z.literal(1), component: z.string().regex(/^[a-z][a-z0-9.-]*$/) })
  .strict()
const declarationSchema = z
  .object({
    dependsOn: z.array(z.string()).default([]),
    mode: z.literal('transactional').default('transactional'),
    phase: z.enum(['before-sync', 'after-sync']).default('after-sync')
  })
  .strict()

/** Read only packaged assets; never scan the deployment workspace or installed plugins. */
export async function loadSchemaMigrations(
  root = resolve(__dirname, 'database-migrations')
): Promise<SchemaMigrationBundle> {
  const read = async (file: string) => {
    const path = resolve(root, file)
    if (relative(root, path).startsWith('..')) throw new Error('Invalid migration asset path')
    const actual = await realpath(path)
    if (relative(await realpath(root), actual).startsWith('..')) throw new Error('Invalid migration asset path')
    return readFile(actual, 'utf8')
  }
  const config = configSchema.parse(JSON.parse(await read('database-migrations.json')))
  const migrations: SchemaSqlMigration[] = []
  const dependencies = new Map<string, string[]>()
  async function scan(directory: string) {
    const entries = await readdir(resolve(root, directory), { withFileTypes: true })
    if (entries.some((entry) => entry.isSymbolicLink())) throw new Error('Migration assets must not contain symlinks')
    const hasSql = entries.some((entry) => /^\d{14}-.*\.sql$/.test(entry.name))
    if (hasSql) {
      const { component } = componentSchema.parse(JSON.parse(await read(`${directory}/component.json`)))
      for (const entry of entries.filter((item) => /^\d{14}-.*\.sql$/.test(item.name))) {
        if (!/^\d{14}-[a-z][a-z0-9-]*\.sql$/.test(entry.name)) throw new Error('Invalid migration filename')
        const sql = await read(`${directory}/${entry.name}`)
        validateSql(sql)
        const header = /^\s*\/\* xpert-migration\s+([\s\S]*?)\*\//.exec(sql)
        const declaration = declarationSchema.parse(header ? JSON.parse(header[1]) : {})
        const id = `${component}.${entry.name.slice(0, -4)}`
        const order = entry.name.slice(0, 14)
        const date = `${order.slice(0, 4)}-${order.slice(4, 6)}-${order.slice(6, 8)}T${order.slice(8, 10)}:${order.slice(10, 12)}:${order.slice(12, 14)}.000Z`
        if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date)
          throw new Error('Invalid migration timestamp')
        const check = await read(`${directory}/checks/${entry.name}`)
        validateSql(check, true)
        migrations.push({
          id,
          name: `${id}_${Date.parse(date)}`,
          sql,
          check,
          phase: declaration.phase,
          baseline: config.baseline.includes(id)
        })
        dependencies.set(id, declaration.dependsOn)
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'checks') await scan(`${directory}/${entry.name}`)
    }
  }
  await scan('core')
  await scan('ai')
  migrations.sort((a, b) => Number(a.name.slice(-13)) - Number(b.name.slice(-13)) || a.id.localeCompare(b.id))
  const ids = migrations.map((item) => item.id)
  if (new Set(ids).size !== ids.length || config.baseline.some((id) => !ids.includes(id)))
    throw new Error('Invalid migration identity')
  for (const migration of migrations) {
    for (const id of dependencies.get(migration.id) ?? []) {
      const dependency = migrations.find((item) => item.id === id)
      if (
        !dependency ||
        ids.indexOf(id) >= ids.indexOf(migration.id) ||
        (migration.phase === 'before-sync' && dependency.phase !== 'before-sync')
      ) {
        throw new Error(`Invalid migration dependency: ${migration.id}`)
      }
    }
  }
  const checks = await Promise.all(config.checks.map(read))
  checks.forEach((sql) => validateSql(sql, true))
  return { managedTables: config.managedTables, migrations, checks }
}
