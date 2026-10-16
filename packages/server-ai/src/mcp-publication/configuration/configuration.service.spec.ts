import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MCP_CONFIGURATION_SECRET_MASK, type JSONValue, type JsonSchemaObjectType } from '@xpert-ai/contracts'
import {
    DecoratedToolsetStrategy,
    RequestContext,
    ToolsetRegistry,
    XpertTool,
    XpertToolProvider
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { RoleGuard } from '@xpert-ai/server-core'
import { McpPublicationService } from '../mcp-publication.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { McpSourceConfigurationService } from './configuration.service'
import { McpPublicationViewHostDefinition } from './mcp-publication-view-host.definition'
import { McpSourceConfigurationController } from './configuration.controller'

const schema: JsonSchemaObjectType = {
    type: 'object',
    title: { en_US: 'Connection configuration', zh_Hans: '配置连接' },
    required: ['mode'],
    properties: {
        mode: { type: 'string', enum: ['manual', 'platform'] },
        password: {
            type: 'string',
            'x-ui': { component: 'secretInput', visibleWhen: [{ name: 'mode', value: 'manual' }] }
        },
        dataSourceId: { type: 'string', 'x-ui': { component: 'remoteSelect', selectUrl: '/api/example/datasources' } },
        enabled: { type: 'boolean' }
    }
}

async function setup(options?: { schema?: JsonSchemaObjectType; credentials?: Record<string, JSONValue> }) {
    jest.spyOn(RequestContext, 'hasRole').mockReturnValue(true)
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
    const toolset = {
        id: 'source-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        workspaceId: 'workspace-1',
        type: 'example',
        name: 'Existing connection',
        updatedAt: new Date('2026-10-16T00:00:00.000Z'),
        credentials: options?.credentials ?? { mode: 'manual', password: 'private-value', enabled: false }
    }
    const publication = {
        id: 'publication-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        capabilities: [{ toolsetId: 'source-1' }, { toolsetId: 'source-1' }]
    }
    const publications = { getManaged: jest.fn().mockResolvedValue(publication) }
    const locked = jest.fn().mockResolvedValue(toolset)
    const update = jest.fn().mockImplementation(async (_entity, _criteria, changes) => {
        Object.assign(toolset, changes, { updatedAt: new Date('2026-10-16T00:00:01.000Z') })
        return { affected: 1 }
    })
    const repository = {
        find: jest.fn().mockResolvedValue([toolset]),
        update,
        locked,
        manager: { transaction: jest.fn((work) => work({ findOne: locked, update })) }
    }
    const strategy = {
        meta: { name: 'example', label: { en_US: 'Example' }, configSchema: options?.schema ?? schema },
        validateConfig: jest.fn()
    }
    const registry = {
        list: jest.fn().mockReturnValue([strategy]),
        getSource: jest.fn().mockReturnValue({ kind: 'plugin', pluginName: '@example/plugin' })
    }
    const workspace = { assertCanWrite: jest.fn() }
    const module = await Test.createTestingModule({
        controllers: [McpSourceConfigurationController],
        providers: [
            McpSourceConfigurationService,
            McpPublicationViewHostDefinition,
            { provide: McpPublicationService, useValue: publications },
            { provide: getRepositoryToken(XpertToolset), useValue: repository },
            { provide: ToolsetRegistry, useValue: registry },
            { provide: XpertWorkspaceAccessService, useValue: workspace }
        ]
    })
        .overrideGuard(RoleGuard)
        .useValue({ canActivate: () => true })
        .compile()
    return {
        module,
        service: module.get(McpSourceConfigurationService),
        host: module.get(McpPublicationViewHostDefinition),
        toolset,
        publication,
        publications,
        repository,
        registry,
        strategy,
        workspace
    }
}

describe('MCP bound source configuration', () => {
    afterEach(() => jest.restoreAllMocks())

    it('resolves every bound plugin independently, preserves form metadata, and omits empty schemas', async () => {
        const ctx = await setup()
        ctx.publication.capabilities.push({ toolsetId: 'source-2' }, { toolsetId: 'source-empty' })
        ctx.repository.find.mockResolvedValue([
            ctx.toolset,
            { ...ctx.toolset, id: 'source-2', type: 'other' },
            { ...ctx.toolset, id: 'source-empty', type: 'empty' }
        ])
        ctx.registry.list.mockReturnValue([
            ctx.strategy,
            { ...ctx.strategy, meta: { ...ctx.strategy.meta, name: 'other' } },
            {
                ...ctx.strategy,
                meta: { ...ctx.strategy.meta, name: 'empty', configSchema: { type: 'object', properties: {} } }
            }
        ])
        ctx.registry.getSource.mockImplementation((strategy) => ({
            kind: 'plugin',
            pluginName: `@example/${strategy.meta.name}`
        }))
        const tabs = await ctx.service.tabs('publication-1')
        expect(tabs.map(({ toolsetId, pluginName }) => [toolsetId, pluginName])).toEqual([
            ['source-1', '@example/example'],
            ['source-2', '@example/other']
        ])
        expect(tabs[0].schema).toEqual(schema)
        expect(tabs[0].title.zh_Hans).toBe('配置连接')
        expect(JSON.stringify(tabs)).not.toContain('private-value')
        const host = await ctx.host.resolve('publication-1')
        expect(host.hostSnapshot.sources).toHaveLength(3)
        expect(JSON.stringify(host)).not.toContain('credentials')
        expect(ctx.repository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: 'tenant-1',
                    organizationId: 'organization-1',
                    category: 'builtin'
                })
            })
        )
        await ctx.module.close()
    })

    it('loads the existing connection, preserves masked passwords and explicit false, then allows clearing', async () => {
        const ctx = await setup()
        const current = await ctx.service.get('publication-1', 'source-1')
        expect(current.values).toEqual({ mode: 'manual', password: MCP_CONFIGURATION_SECRET_MASK, enabled: false })
        await ctx.service.update('publication-1', 'source-1', {
            ...current,
            values: { ...current.values, enabled: false }
        })
        expect(ctx.toolset.credentials.password).toBe('private-value')
        const saved = await ctx.service.get('publication-1', 'source-1')
        await ctx.service.update('publication-1', 'source-1', { ...saved, values: { ...saved.values, password: '' } })
        expect(ctx.toolset.credentials.password).toBe('')
        expect(ctx.workspace.assertCanWrite).toHaveBeenCalledWith('workspace-1')
        await ctx.module.close()
    })

    it('rejects stale saves, unknown fields, invalid enum values and concurrent updates', async () => {
        const ctx = await setup()
        const current = await ctx.service.get('publication-1', 'source-1')
        await expect(
            ctx.service.update('publication-1', 'source-1', { ...current, revision: 'old' })
        ).rejects.toMatchObject({ status: 409 })
        await expect(
            ctx.service.update('publication-1', 'source-1', { ...current, values: { mode: 'guess' } })
        ).rejects.toMatchObject({ status: 400 })
        await expect(
            ctx.service.update('publication-1', 'source-1', {
                ...current,
                values: { mode: 'manual', tenantId: 'another' }
            })
        ).rejects.toMatchObject({ status: 400 })
        expect(ctx.repository.update).not.toHaveBeenCalled()
        ctx.repository.locked.mockResolvedValue({ ...ctx.toolset, updatedAt: new Date('2026-10-16T00:00:02.000Z') })
        await expect(ctx.service.update('publication-1', 'source-1', current)).rejects.toMatchObject({ status: 409 })
        await ctx.module.close()
    })

    it('denies unbound sources, publication denial, workspace denial and non-admin callers', async () => {
        const ctx = await setup()
        await expect(ctx.service.get('publication-1', 'not-bound')).rejects.toMatchObject({ status: 404 })
        ctx.workspace.assertCanWrite.mockRejectedValue(new ForbiddenException())
        await expect(ctx.service.get('publication-1', 'source-1')).rejects.toMatchObject({ status: 403 })
        ctx.publications.getManaged.mockRejectedValue(new ForbiddenException())
        await expect(ctx.service.tabs('another-publication')).rejects.toMatchObject({ status: 403 })
        jest.mocked(RequestContext.hasRole).mockReturnValue(false)
        expect(ctx.host.canRead()).toBe(false)
        await expect(ctx.service.tabs('publication-1')).rejects.toMatchObject({ status: 403 })
        await ctx.module.close()
    })

    it('shows shared-source tabs without disclosing or editing tenant credentials from an organization', async () => {
        const ctx = await setup()
        ctx.publication.organizationId = null
        expect((await ctx.service.tabs('publication-1'))[0].canEdit).toBe(false)
        await expect(ctx.service.get('publication-1', 'source-1')).rejects.toMatchObject({ status: 403 })
        expect(ctx.registry.list).toHaveBeenCalledWith('global')
        await ctx.module.close()
    })

    it('validates HTTP update bodies and keeps GET responses masked', async () => {
        const ctx = await setup()
        const app = ctx.module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        const url = `${await app.getUrl()}/mcp-publications/publication-1/plugin-configurations/source-1`
        const put = (body: object) =>
            fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        try {
            const response = await fetch(url)
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.values.password).toBe(MCP_CONFIGURATION_SECRET_MASK)
            expect((await put({ values: [], revision: 'invalid' })).status).toBe(400)
            expect((await put({ ...body, toolsetId: 'other' })).status).toBe(400)
            expect(ctx.repository.update).not.toHaveBeenCalled()
            expect((await put(body)).status).toBe(200)
            jest.mocked(RequestContext.hasRole).mockReturnValue(false)
            expect((await fetch(url)).status).toBe(403)
        } finally {
            await app.close()
        }
    })

    it('runs native provider validation before persisting an HTTP configuration update', async () => {
        const config = z.discriminatedUnion('mode', [
            z.object({ mode: z.literal('manual'), password: z.string() }),
            z.object({ mode: z.literal('platform'), dataSourceId: z.string().min(1) })
        ])
        @XpertToolProvider({ provider: 'example', componentKey: 'example', name: 'Example', configSchema: schema })
        class ConfiguredProvider {
            validateConfig(values: unknown) {
                if (!config.safeParse(values).success) throw new BadRequestException('Invalid connection configuration')
            }
            @XpertTool({
                name: 'ping',
                description: 'Configuration test capability',
                inputSchema: z.object({}).strict(),
                outputSchema: z.object({ ok: z.boolean() }).strict(),
                mcp: {
                    behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
                    requiredContext: ['tenant', 'principal']
                }
            })
            ping() {
                return { ok: true }
            }
        }
        const ctx = await setup()
        ctx.registry.list.mockReturnValue([new DecoratedToolsetStrategy(new ConfiguredProvider())])
        const app = ctx.module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        const url = `${await app.getUrl()}/mcp-publications/publication-1/plugin-configurations/source-1`
        const current = await ctx.service.get('publication-1', 'source-1')
        const put = (values: Record<string, JSONValue>) =>
            fetch(url, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ revision: current.revision, values })
            })
        try {
            for (const values of [{ mode: 'platform' }, { mode: 'platform', dataSourceId: '' }]) {
                expect((await put(values)).status).toBe(400)
            }
            expect(ctx.repository.update).not.toHaveBeenCalled()
            expect((await put({ mode: 'platform', dataSourceId: 'source' })).status).toBe(200)
            expect(ctx.repository.update).toHaveBeenCalledTimes(1)
        } finally {
            await app.close()
        }
    })

    it('keeps array secrets attached to their entries through HTTP GET and PUT', async () => {
        const accounts = [
            { name: 'a', password: 'secret-a' },
            { name: 'b', password: 'secret-b' }
        ]
        const ctx = await setup({
            schema: {
                type: 'object',
                properties: {
                    accounts: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                password: { type: 'string', 'x-ui': { component: 'secretInput' } }
                            }
                        }
                    }
                }
            },
            credentials: { accounts }
        })
        const app = ctx.module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        const url = `${await app.getUrl()}/mcp-publications/publication-1/plugin-configurations/source-1`
        const responseSchema = z.object({
            values: z.object({ accounts: z.array(z.object({ name: z.string(), password: z.string() })) }),
            revision: z.string()
        })
        const put = (body: z.infer<typeof responseSchema>) =>
            fetch(url, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body)
            })
        try {
            const current = responseSchema.parse(await (await fetch(url)).json())
            expect(JSON.stringify(current)).not.toContain('secret-a')
            expect(JSON.stringify(current)).not.toContain('secret-b')
            current.values.accounts.splice(0, 1)
            const response = await put(current)
            expect(response.status).toBe(200)
            expect(ctx.toolset.credentials.accounts).toEqual([accounts[1]])
            const saved = responseSchema.parse(await response.json())
            saved.values.accounts[0].password = MCP_CONFIGURATION_SECRET_MASK
            expect((await put(saved)).status).toBe(400)
            expect(ctx.repository.update).toHaveBeenCalledTimes(1)
        } finally {
            await app.close()
        }
    })
})
