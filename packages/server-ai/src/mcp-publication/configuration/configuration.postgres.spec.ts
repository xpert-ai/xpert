import { randomUUID } from 'node:crypto'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MCP_CONFIGURATION_SECRET_MASK, XpertToolsetCategoryEnum, type JsonSchemaObjectType } from '@xpert-ai/contracts'
import { RequestContext, ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { Tag } from '@xpert-ai/server-core'
import { DataSource, EntitySchema, getMetadataArgsStorage } from 'typeorm'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { McpPublicationService } from '../mcp-publication.service'
import { McpSourceConfigurationService } from './configuration.service'

// Point only at a disposable PostgreSQL database; never use the platform database.
const databaseUrl = process.env.MCP_CONFIGURATION_TEST_DATABASE_URL
const postgres = databaseUrl ? describe : describe.skip
const schemaName = `mcp_configuration_${randomUUID().replace(/-/g, '')}`
const scope = { tenantId: 'tenant', organizationId: 'organization' }
const configurationSchema: JsonSchemaObjectType = {
    type: 'object',
    required: ['mode'],
    properties: {
        mode: { type: 'string', enum: ['manual', 'platform'] },
        password: { type: 'string', 'x-ui': { component: 'secretInput' } },
        enabled: { type: 'boolean' }
    }
}

postgres('MCP source configuration persistence on PostgreSQL', () => {
    let db: DataSource
    let module: TestingModule
    let service: McpSourceConfigurationService

    beforeAll(async () => {
        const tags = getMetadataArgsStorage().relations.find(
            ({ target, propertyName }) => target === XpertToolset && propertyName === 'tags'
        )
        expect(tags?.options.eager).toBe(true)
        db = await new DataSource({
            type: 'postgres',
            url: databaseUrl,
            schema: schemaName,
            entities: [
                new EntitySchema<XpertToolset>({
                    name: 'XpertToolset',
                    target: XpertToolset,
                    columns: {
                        id: { type: 'varchar', primary: true },
                        tenantId: { type: 'varchar' },
                        organizationId: { type: 'varchar' },
                        category: { type: 'varchar' },
                        type: { type: 'varchar' },
                        name: { type: 'varchar' },
                        credentials: { type: 'jsonb' },
                        updatedAt: { type: 'timestamptz', updateDate: true }
                    },
                    relations: {
                        tags: { type: 'many-to-many', target: 'Tag', joinTable: true, eager: tags?.options.eager }
                    }
                }),
                new EntitySchema<Tag>({
                    name: 'Tag',
                    target: Tag,
                    columns: { id: { type: 'varchar', primary: true } }
                })
            ]
        }).initialize()
        await db.query(`CREATE SCHEMA "${schemaName}"`)
        await db.synchronize()
        await db.getRepository(Tag).save({ id: 'retained-tag' })
        jest.spyOn(RequestContext, 'hasRole').mockReturnValue(true)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        module = await Test.createTestingModule({
            providers: [
                McpSourceConfigurationService,
                { provide: getRepositoryToken(XpertToolset), useValue: db.getRepository(XpertToolset) },
                {
                    provide: McpPublicationService,
                    useValue: {
                        getManaged: async () => ({
                            ...scope,
                            capabilities: ['untagged', 'tagged', 'concurrent'].map((toolsetId) => ({ toolsetId }))
                        })
                    }
                },
                {
                    provide: ToolsetRegistry,
                    useValue: {
                        list: () => [
                            { meta: { name: 'example', configSchema: configurationSchema }, validateConfig: jest.fn() }
                        ],
                        getSource: () => ({ kind: 'plugin', pluginName: '@example/plugin' })
                    }
                },
                { provide: XpertWorkspaceAccessService, useValue: { assertCanWrite: jest.fn() } }
            ]
        }).compile()
        service = module.get(McpSourceConfigurationService)
    })

    afterAll(async () => {
        jest.restoreAllMocks()
        await module?.close()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schemaName}" CASCADE`)
            await db.destroy()
        }
    })

    async function seed(id: string, tagged = false) {
        await db.getRepository(XpertToolset).save({
            id,
            ...scope,
            name: id,
            category: XpertToolsetCategoryEnum.BUILTIN,
            type: 'example',
            credentials: { mode: 'manual', password: 'fixture-secret', enabled: true },
            updatedAt: new Date('2026-10-01T00:00:00.000Z'),
            tags: tagged ? [{ id: 'retained-tag' }] : []
        })
    }

    it.each([
        ['untagged', false],
        ['tagged', true]
    ] as const)('saves %s connections, retains secrets and tags, and rejects a stale revision', async (id, tagged) => {
        await seed(id, tagged)
        // Control: default eager joins reproduce the real PostgreSQL failure.
        await expect(
            db.transaction((manager) =>
                manager.findOne(XpertToolset, { where: { id }, lock: { mode: 'pessimistic_write' } })
            )
        ).rejects.toMatchObject({ driverError: { code: '0A000' } })
        const before = await service.get('publication', id)
        expect(before.values.password).toBe(MCP_CONFIGURATION_SECRET_MASK)
        const saved = await service.update('publication', id, {
            ...before,
            values: { ...before.values, enabled: false }
        })
        expect(saved.values).toEqual({ mode: 'manual', password: MCP_CONFIGURATION_SECRET_MASK, enabled: false })
        const persisted = await db.getRepository(XpertToolset).findOneByOrFail({ id })
        expect(persisted.credentials?.password).toBe('fixture-secret')
        expect(persisted.tags?.map(({ id }) => id)).toEqual(tagged ? ['retained-tag'] : [])
        await expect(service.update('publication', id, before)).rejects.toMatchObject({ status: 409 })
    })

    it('allows only one of two concurrent saves of the same revision', async () => {
        await seed('concurrent')
        const before = await service.get('publication', 'concurrent')
        const results = await Promise.allSettled([
            service.update('publication', 'concurrent', { ...before, values: { ...before.values, enabled: false } }),
            service.update('publication', 'concurrent', { ...before, values: { ...before.values, enabled: true } })
        ])
        expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
        expect(results.find(({ status }) => status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    })
})
