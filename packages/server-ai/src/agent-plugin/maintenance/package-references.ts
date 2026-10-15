// Be conservative: any persisted JSON occurrence of the immutable identity protects a version.
// Include drafts, history, execution snapshots and organization consumers of tenant packages.
import type { EntityManager } from 'typeorm'
import type { AgentPluginPackage, AgentResourceBinding } from '../agent-plugin.entity'
import { importedPluginBinding } from '../installed-plugin-catalog'

export async function referencedPackages(
    manager: EntityManager,
    packages: AgentPluginPackage[],
    bindings: AgentResourceBinding[] = []
) {
    const referenced = new Set<string>()
    if (!packages.length) return referenced
    const escape = (name: string) => manager.connection.driver.escape(name)
    for (const table of manager.connection.entityMetadatas) {
        if (['agent_plugin_package', 'agent_resource_binding'].includes(table.tableName)) continue
        const columns = table.columns.filter((column) => ['json', 'jsonb', 'simple-json'].includes(String(column.type)))
        if (!columns.length) continue
        const candidates = packages.filter((pkg) => !referenced.has(pkg.id))
        if (!candidates.length) break
        const needles = candidates.flatMap((pkg) =>
            [
                pkg.id,
                pkg.digest,
                importedPluginBinding(pkg).id,
                ...bindings.flatMap((binding) =>
                    binding.definition.kind === 'agent_plugin' && binding.definition.packageId === pkg.id
                        ? [binding.id, binding.version]
                        : []
                )
            ].map((token) => ({
                id: pkg.id,
                pattern: `%${token.replace(/[\\%_]/g, '\\$&')}%`
            }))
        )
        const tenant = table.columns.find((column) => column.propertyName === 'tenantId')
        const organization = table.columns.find((column) => column.propertyName === 'organizationId')
        const scopeOrganization = tenant && organization && packages[0].organizationId
        const predicate = columns
            .map((column) => `CAST(r.${escape(column.databaseName)} AS text) LIKE n.pattern`)
            .join(' OR ')
        const rows: { id: string }[] = await manager.query(
            `SELECT DISTINCT n.id FROM jsonb_to_recordset($1::jsonb) AS n(id text, pattern text)
             WHERE EXISTS (SELECT 1 FROM ${table.tablePath.split('.').map(escape).join('.')} r
               WHERE (${predicate}) ${tenant ? `AND (r.${escape(tenant.databaseName)} = $2 OR r.${escape(tenant.databaseName)} IS NULL)` : ''}
               ${scopeOrganization ? `AND (r.${escape(organization.databaseName)} = $3 OR r.${escape(organization.databaseName)} IS NULL)` : ''})`,
            scopeOrganization
                ? [JSON.stringify(needles), packages[0].tenantId, scopeOrganization]
                : tenant
                  ? [JSON.stringify(needles), packages[0].tenantId]
                  : [JSON.stringify(needles)]
        )
        for (const row of rows) referenced.add(row.id)
    }
    return referenced
}
