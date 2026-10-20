// Keep version/scope precedence intact before paging; template snapshots and images are page details.
import { In, type Repository } from 'typeorm'
import type { AgentPluginXpertExtension } from '@xpert-ai/contracts'
import type { AgentPluginPackage } from './agent-plugin.entity'
import { visibleAgentPluginScopes, type AgentPluginScope } from './agent-plugin-scope'

export type InstalledPluginInventoryPackage = Pick<
    AgentPluginPackage,
    'id' | 'tenantId' | 'organizationId' | 'createdAt' | 'digest'
> & {
    descriptor: {
        name: string
        description?: string
        extension?: Pick<AgentPluginXpertExtension, 'role' | 'connectors'> & {
            interface?: Pick<NonNullable<AgentPluginXpertExtension['interface']>, 'displayName' | 'description'>
        }
    }
}

export function readInstalledPluginInventory(repository: Repository<AgentPluginPackage>, scope: AgentPluginScope) {
    return repository
        .createQueryBuilder('pkg')
        .select([
            'pkg.id AS "id"',
            'pkg.tenantId AS "tenantId"',
            'pkg.organizationId AS "organizationId"',
            'pkg.createdAt AS "createdAt"',
            'pkg.digest AS "digest"'
        ])
        .addSelect(
            `jsonb_strip_nulls(jsonb_build_object(
                'name', pkg.descriptor->'name',
                'description', pkg.descriptor->'description'
            )) || jsonb_build_object(
                'extension', jsonb_strip_nulls(jsonb_build_object(
                    'role', pkg.descriptor->'extension'->'role',
                    'interface', jsonb_build_object(
                        'displayName', pkg.descriptor->'extension'->'interface'->'displayName',
                        'description', pkg.descriptor->'extension'->'interface'->'description'
                    )
                )) || CASE WHEN pkg.descriptor->'extension' ? 'connectors'
                    THEN jsonb_build_object('connectors', pkg.descriptor->'extension'->'connectors')
                    ELSE '{}'::jsonb END
            )`,
            'descriptor'
        )
        .where(visibleAgentPluginScopes(scope))
        .getRawMany<InstalledPluginInventoryPackage>()
}

export function readInstalledPluginDetails(
    repository: Repository<AgentPluginPackage>,
    scope: AgentPluginScope,
    ids: string[]
) {
    return ids.length
        ? repository.find({
              where: visibleAgentPluginScopes(scope).map((where) => ({ ...where, id: In([...new Set(ids)]) }))
          })
        : Promise.resolve([])
}
