import { ModuleRef } from '@nestjs/core'
import { FindOperator, Repository } from 'typeorm'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum, type IXpert } from '@xpert-ai/contracts'
import { AgentPluginInstallationsService } from './agent-plugin-installations.service'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { importedPluginBinding } from './installed-plugin-catalog'
import { PluginResourceInstallerService } from '../plugin-resource/plugin-resource-installer.service'
import { AgentPluginService } from './agent-plugin.service'
import { RuntimeResourceService } from './runtime-resource.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'

jest.mock('./agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))
jest.mock('./agent-plugin.service', () => ({
    AgentPluginService: class {},
    resourceScope: () => ({ tenantId: 'tenant', organizationId: 'org' })
}))
jest.mock('./agent-plugin-connector.service', () => ({ AgentPluginConnectorService: class {} }))
jest.mock('../plugin-resource/plugin-resource-installer.service', () => ({ PluginResourceInstallerService: class {} }))
jest.mock('../skill-package/skill-package.entity', () => ({ SkillPackage: class {} }))
jest.mock('../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))
jest.mock('../xpert/published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))

type ScopedRecord = { id?: string; tenantId?: string; organizationId?: string; version?: string; enabled?: boolean }
type Where = { [key in keyof ScopedRecord]?: ScopedRecord[key] | FindOperator<string> }
function matches(record: ScopedRecord, where: Where) {
    return Object.entries(where).every(([key, value]) => {
        const actual = record[key as keyof ScopedRecord]
        return value instanceof FindOperator && value.type === 'isNull' ? actual == null : actual === value
    })
}

describe('installed plugins through the ChatKit catalog and runtime', () => {
    const scope = { tenantId: 'tenant', organizationId: 'org' }
    const assistant: IXpert = {
        id: 'assistant',
        name: 'Assistant',
        slug: 'assistant',
        type: XpertTypeEnum.Agent,
        ...scope,
        workspaceId: 'new-workspace'
    }
    let packages: AgentPluginPackage[]
    let records: AgentResourceBinding[]
    let installations: AgentPluginInstallationsService
    let runtime: RuntimeResourceService
    let install: jest.Mock
    let connectorReferences: jest.Mock
    let workspaceUpdate: jest.Mock
    let lock: jest.Mock
    let assistantAccess: jest.Mock
    let manager: {
        getRepository: jest.Mock
        query: jest.Mock
        findOneBy: jest.Mock
        save: jest.Mock
        update: jest.Mock
        transaction: (fn: (manager: object) => Promise<unknown>) => Promise<unknown>
    }

    it('pins an older template digest, applies organization precedence, and revokes disabled packages', async () => {
        const older = packages[0]
        const newer = { ...older, id: 'new-package', digest: 'new-digest', createdAt: new Date('2026-10-02') }
        packages.unshift(newer)
        expect((await installations.templatePackage('documents')).pkg.id).toBe('new-package')
        expect((await installations.templatePackage('documents', 'digest')).pkg.id).toBe('package')
        const hidden = { ...newer, id: 'other-org', organizationId: 'other', digest: 'other-digest' }
        packages.unshift(hidden)
        expect(await installations.templatePackage('documents', 'other-digest')).toBeNull()
        records.push({ ...importedPluginBinding(newer), enabled: false })
        expect(await installations.templatePackage('documents', 'digest')).toBeNull()
    })
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        packages = [
            {
                id: 'package',
                ...scope,
                rootPath: '/plugin',
                digest: 'digest',
                source: { kind: 'zip' },
                createdAt: new Date('2026-10-01'),
                descriptor: {
                    name: 'documents',
                    skills: [{ key: 'write', description: 'Write', path: 'skills/write/SKILL.md' }],
                    servers: [],
                    diagnostics: []
                }
            }
        ]
        records = []
        lock = jest.fn()
        workspaceUpdate = jest.fn()
        install = jest
            .fn()
            .mockImplementation(async (_component, workspaceId) => ({ runtimeId: `skill-${workspaceId}` }))
        connectorReferences = jest.fn().mockResolvedValue({})
        assistantAccess = jest.fn().mockResolvedValue(assistant)
        const findPackages = jest.fn(async ({ where }: { where: Where | Where[] }) =>
            packages.filter((record) => (Array.isArray(where) ? where : [where]).some((item) => matches(record, item)))
        )
        const findBindings = jest.fn(async ({ where }: { where: Where | Where[] }) =>
            records.filter((record) => (Array.isArray(where) ? where : [where]).some((item) => matches(record, item)))
        )
        manager = {
            getRepository: jest.fn((entity) => ({ find: entity === AgentPluginPackage ? findPackages : findBindings })),
            query: lock,
            findOneBy: jest.fn(async (_type, where) => records.find((record) => matches(record, where)) ?? null),
            save: jest.fn(async (_type, record: AgentResourceBinding) => {
                records.push(record)
                return record
            }),
            update: jest.fn(async (_type, where, patch: Partial<AgentResourceBinding>) => {
                Object.assign(
                    records.find((record) => matches(record, where)),
                    patch
                )
            }),
            transaction: async (fn) => fn(manager)
        }
        const packageRepository = {
            find: findPackages,
            manager: { getRepository: () => ({ update: workspaceUpdate }) }
        } as unknown as Repository<AgentPluginPackage>
        const bindingRepository = {
            find: findBindings,
            findOneBy: jest.fn(async (where) => records.find((record) => matches(record, where)) ?? null),
            create: (record: AgentResourceBinding) => record,
            manager
        } as unknown as Repository<AgentResourceBinding>
        installations = new AgentPluginInstallationsService(
            packageRepository,
            bindingRepository,
            { installRuntimeComponent: install } as unknown as PluginResourceInstallerService,
            { runtimeBindings: connectorReferences } as unknown as AgentPluginConnectorService
        )
        const dependencies = new Map<unknown, unknown>([
            [AgentMiddlewareRegistry, { get: () => ({ meta: {} }), list: () => [] }],
            [
                PublishedXpertAccessService,
                { getAccessiblePublishedXpert: assistantAccess, findAccessiblePublishedResources: async () => [] }
            ]
        ])
        runtime = new RuntimeResourceService(
            {
                packages: packageRepository,
                bindings: bindingRepository,
                validateMiddleware: jest.fn()
            } as unknown as AgentPluginService,
            { get: (token: unknown) => dependencies.get(token) } as ModuleRef,
            installations
        )
    })
    afterEach(() => jest.restoreAllMocks())

    const selected = (binding: AgentResourceBinding) => ({
        revision: 3,
        resources: [{ bindingId: binding.id, version: binding.version }]
    })

    it('shows imports to an Assistant runner and leaves catalog reads free of installation writes', async () => {
        const result = await runtime.catalog('assistant', { kind: 'agent_plugin' })
        expect(result.items).toHaveLength(1)
        expect(result.items[0]).toMatchObject({ title: 'documents', status: 'ready' })
        expect(assistantAccess).toHaveBeenCalledWith('assistant', { relations: ['agent'] })
        expect(install).not.toHaveBeenCalled()
        expect(manager.save).not.toHaveBeenCalled()
        expect(JSON.stringify(result)).not.toMatch(/rootPath|tenantId|organizationId|connectorServers/)
    })
    it('prepares only the selected plugin without workspace editor permissions and reuses the result', async () => {
        const binding = importedPluginBinding(packages[0])
        const result = await runtime.resolve('assistant', selected(binding))
        expect(result.selection).toEqual(selected(binding))
        expect(result.skillIds).toEqual(['skill-new-workspace'])
        expect(workspaceUpdate).toHaveBeenCalledWith(
            { ...scope, id: 'skill-new-workspace' },
            { runtimeResourceOnly: true }
        )
        expect(lock).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
            `agent-plugin:${binding.id}`
        ])
        await runtime.resolve('assistant', selected(binding))
        expect(install).toHaveBeenCalledTimes(1)
        expect(records).toHaveLength(1)
    })
    it('resolves tenant references in the current organization without moving the package scope', async () => {
        packages[0].organizationId = null
        const binding = importedPluginBinding(packages[0])
        expect((await runtime.catalog('assistant', { kind: 'agent_plugin' })).total).toBe(1)
        await runtime.resolve('assistant', selected(binding))
        expect(records[0].organizationId).toBeNull()
        expect(workspaceUpdate).toHaveBeenCalledWith({ ...scope, id: 'skill-new-workspace' }, expect.anything())
        const second = { ...assistant, workspaceId: 'second', organizationId: 'second-org' }
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('second-org')
        await installations.prepare(selected(binding).resources[0], second)
        expect(Object.keys(records[0].installations).sort()).toEqual(['new-workspace', 'second'])
        expect(workspaceUpdate).toHaveBeenLastCalledWith(
            { ...scope, organizationId: 'second-org', id: 'skill-second' },
            expect.anything()
        )
    })
    it('reserves automatic template references without changing their identity or version', async () => {
        const original = { ...importedPluginBinding(packages[0]), cleanupEligible: true }
        records.push(original)
        await installations.retainTemplateReference({ bindingId: original.id, version: original.version })
        expect(manager.save).toHaveBeenCalledWith(
            AgentResourceBinding,
            expect.objectContaining({ id: original.id, version: original.version, cleanupEligible: false })
        )
    })
    it('preserves old conversation IDs, versions and existing installations', async () => {
        const original = {
            ...importedPluginBinding(packages[0]),
            id: 'aaabbbbb-cccc-4ddd-8eee-ffffffffffff',
            version: 'a'.repeat(64),
            definition: { kind: 'agent_plugin' as const, packageId: 'package', experts: {} },
            workspaceIds: ['new-workspace'],
            installations: { 'new-workspace': { skills: ['old-skill'], toolsets: [], connectors: {} } }
        }
        records.push(original)
        const selection = selected(original)
        expect((await runtime.resolve('assistant', selection)).skillIds).toEqual(['old-skill'])
        expect((await runtime.resolve('assistant', selection)).selection).toEqual(selection)
        expect(install).not.toHaveBeenCalled()
    })
    it('rejects revocation, forged versions, missing packages and cross-organization references', async () => {
        const binding = importedPluginBinding(packages[0])
        records.push({ ...binding, enabled: false })
        await expect(runtime.resolve('assistant', selected(binding))).rejects.toThrow()
        records = []
        await expect(runtime.resolve('assistant', selected({ ...binding, version: 'b'.repeat(64) }))).rejects.toThrow()
        packages[0].organizationId = 'other'
        await expect(runtime.resolve('assistant', selected(binding))).rejects.toThrow()
        expect((await runtime.catalog('assistant', { kind: 'agent_plugin' })).total).toBe(0)
        packages = []
        await expect(runtime.resolve('assistant', selected(binding))).rejects.toThrow()
        expect(install).not.toHaveBeenCalled()
    })
    it('keeps plugins needing Connector setup visible without creating connections or preparing resources', async () => {
        packages[0].descriptor.servers = [
            { key: 'remote', config: { type: 'streamable-http', url: 'https://example.com/mcp' } }
        ]
        packages[0].descriptor.extension = {
            version: 1,
            connectors: { remote: { type: 'existing', provider: 'remote', resource: 'https://example.com' } }
        }
        const result = await runtime.catalog('assistant', { kind: 'agent_plugin' })
        expect(result.items[0]).toMatchObject({ status: 'configuration_required' })
        await expect(
            runtime.resolve('assistant', {
                revision: 0,
                resources: [{ bindingId: result.items[0].bindingId, version: result.items[0].version }]
            })
        ).rejects.toThrow()
        expect(install).not.toHaveBeenCalled()
        expect(manager.save).not.toHaveBeenCalled()
    })
    it('keeps missing expert mappings visible and rejects execution until configured', async () => {
        packages[0].descriptor.extension = { version: 1, experts: [{ key: 'writer', reference: 'writer' }] }
        const result = await runtime.catalog('assistant', { kind: 'agent_plugin' })
        expect(result.items[0].status).toBe('configuration_required')
        expect(result.items[0].diagnostics[0].code).toBe('configuration_required')
        await expect(runtime.resolve('assistant', selected(importedPluginBinding(packages[0])))).rejects.toThrow()
        expect(install).not.toHaveBeenCalled()
    })
    it('retains Assistant authorization before catalog reads or preparation', async () => {
        assistantAccess.mockRejectedValue(new Error('revoked'))
        await expect(runtime.catalog('assistant', {})).rejects.toThrow('revoked')
        await expect(runtime.resolve('assistant', selected(importedPluginBinding(packages[0])))).rejects.toThrow(
            'revoked'
        )
        expect(connectorReferences).not.toHaveBeenCalled()
        expect(install).not.toHaveBeenCalled()
    })
})
