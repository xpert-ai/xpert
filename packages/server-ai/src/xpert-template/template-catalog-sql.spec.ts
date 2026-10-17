import { DataSource, EntitySchema } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AgentPluginInstallationsService } from '../agent-plugin/agent-plugin-installations.service'
import { AgentPluginConnectorService } from '../agent-plugin/agent-plugin-connector.service'
import { AgentPluginPackage, AgentResourceBinding } from '../agent-plugin/agent-plugin.entity'
import { PluginResourceInstallerService } from '../plugin-resource/plugin-resource-installer.service'
import { TemplatePublicationEntity } from './lifecycle/template-publication.entity'
import { TemplatePublicationStore } from './lifecycle/template-publication.store'

jest.mock('../agent-plugin/agent-plugin.entity', () => ({
    AgentPluginPackage: class {},
    AgentResourceBinding: class {}
}))
jest.mock('../agent-plugin/agent-plugin-connector.service', () => ({ AgentPluginConnectorService: class {} }))
jest.mock('../plugin-resource/plugin-resource-installer.service', () => ({ PluginResourceInstallerService: class {} }))
jest.mock('../skill-package/skill-package.entity', () => ({ SkillPackage: class {} }))
jest.mock('../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))
jest.mock('./lifecycle/template-publication.entity', () => ({ TemplatePublicationEntity: class {} }))

class QueryDataSource extends DataSource {
    prepare() {
        return this.buildMetadatas()
    }
}

// Compile production queries with the PostgreSQL driver without opening a database connection.
const scopeColumns = {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'uuid' },
    organizationId: { type: 'uuid', nullable: true },
    createdAt: { type: 'timestamptz' }
} as const

describe('template catalog PostgreSQL queries', () => {
    let database: QueryDataSource
    beforeAll(async () => {
        database = new QueryDataSource({
            type: 'postgres',
            entities: [
                new EntitySchema<AgentPluginPackage>({
                    name: 'AgentPluginPackage',
                    target: AgentPluginPackage,
                    tableName: 'agent_plugin_package',
                    columns: { ...scopeColumns, descriptor: { type: 'jsonb' } }
                }),
                new EntitySchema<AgentResourceBinding>({
                    name: 'AgentResourceBinding',
                    target: AgentResourceBinding,
                    tableName: 'agent_resource_binding',
                    columns: { ...scopeColumns, definition: { type: 'jsonb' } }
                }),
                new EntitySchema<TemplatePublicationEntity>({
                    name: 'TemplatePublicationEntity',
                    target: TemplatePublicationEntity,
                    tableName: 'assistant_template_publication',
                    columns: {
                        ...scopeColumns,
                        updatedAt: { type: 'timestamptz' },
                        revoked: { type: 'boolean' },
                        visibility: { type: 'varchar' },
                        version: { type: 'varchar' },
                        contentHash: { type: 'varchar' },
                        releaseNotes: { type: 'text' },
                        content: { type: 'jsonb' }
                    }
                })
            ]
        })
        await database.prepare()
    })
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(() => jest.restoreAllMocks())

    it.each(['org', undefined])('binds package names and all package IDs within scope %p', async (organizationId) => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
        const packageName = "@scope/office' OR true --"
        const packages = database.getRepository(AgentPluginPackage)
        const bindings = database.getRepository(AgentResourceBinding)
        const packageQuery = packages.createQueryBuilder('package')
        const bindingQuery = bindings.createQueryBuilder('binding')
        const rows = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'].map((id) =>
            Object.assign(new AgentPluginPackage(), {
                id,
                tenantId: 'tenant',
                organizationId: organizationId ?? null,
                descriptor: { name: packageName, skills: [], servers: [], diagnostics: [] }
            })
        )
        jest.spyOn(packages, 'find').mockImplementation(async (options) => {
            packageQuery.setFindOptions(options)
            return rows
        })
        jest.spyOn(bindings, 'find').mockImplementation(async (options) => {
            bindingQuery.setFindOptions(options)
            return []
        })
        const service = new AgentPluginInstallationsService(
            packages,
            bindings,
            {} as PluginResourceInstallerService,
            {} as AgentPluginConnectorService
        )
        await service.installedCatalog(undefined, packageName)
        const [packageSql, packageParameters] = packageQuery.getQueryAndParameters()
        const [bindingSql, bindingParameters] = bindingQuery.getQueryAndParameters()
        const scopes = organizationId ? 2 : 1
        expect(packageSql.match(/"package"\."descriptor" ->> 'name' = \$\d+/g)).toHaveLength(scopes)
        expect(bindingSql.match(/"binding"\."definition" ->> 'packageId' IN \(\$\d+, \$\d+\)/g)).toHaveLength(scopes)
        for (const [sql, parameters] of [
            [packageSql, packageParameters],
            [bindingSql, bindingParameters]
        ] as const) {
            expect(sql).not.toContain(packageName)
            expect(sql.match(/"tenantId" = \$\d+/g)).toHaveLength(scopes)
            expect(sql).toContain('"organizationId" IS NULL')
            expect(parameters).toContain('tenant')
            if (organizationId) {
                expect(sql).toMatch(/"organizationId" = \$\d+/)
                expect(parameters).toContain(organizationId)
                expect(sql).toContain(' OR ')
            } else expect(sql).not.toMatch(/"organizationId" = /)
        }
        expect(packageParameters).toContain(packageName)
        expect(bindingParameters).toEqual(expect.arrayContaining(rows.map((row) => row.id)))
    })

    it('projects only publication summaries while preserving visibility, revocation and ordering', async () => {
        const repository = database.getRepository(TemplatePublicationEntity)
        const query = repository.createQueryBuilder('publication')
        jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(query)
        jest.spyOn(query, 'getRawMany').mockResolvedValue([])
        expect(await new TemplatePublicationStore(database).listSummaries()).toEqual([])
        const [sql, parameters] = query.getQueryAndParameters()
        const selection = sql.slice(0, sql.indexOf(' FROM '))
        expect(selection).toBe(
            'SELECT "publication"."id" AS "id", "publication"."version" AS "version", ' +
                '"publication"."contentHash" AS "contentHash", "publication"."releaseNotes" AS "releaseNotes", ' +
                '"publication"."content" -> \'presentation\' AS "presentation"'
        )
        expect(sql).toContain('"publication"."revoked" = false')
        expect(sql).toContain(
            '("publication"."visibility" = $1 OR (publication."tenantId" = $2 AND publication."organizationId" = $3))'
        )
        expect(sql).toContain('ORDER BY "publication"."updatedAt" DESC')
        expect(parameters).toEqual(['public', 'tenant', 'org'])
    })
})
