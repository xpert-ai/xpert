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

type ScopedRecord = {
    id?: string
    tenantId?: string
    organizationId?: string
    version?: string
    enabled?: boolean
    descriptor?: AgentPluginPackage['descriptor']
    definition?: AgentResourceBinding['definition']
}
type Where = { [key in keyof ScopedRecord]?: ScopedRecord[key] | FindOperator<string> }
function matches(record: ScopedRecord, where: Where) {
    return Object.entries(where).every(([key, value]) => {
        const actual = record[key as keyof ScopedRecord]
        if (value instanceof FindOperator) {
            if (value.type === 'isNull') return actual == null
            if (value.type === 'in') return typeof actual === 'string' && value.value.includes(actual)
            if (value.type === 'raw' && key === 'descriptor')
                return record.descriptor?.name === value.objectLiteralParameters.packageName
            if (value.type === 'raw' && key === 'definition')
                return (
                    record.definition?.kind === 'agent_plugin' &&
                    value.objectLiteralParameters.packageIds.includes(record.definition.packageId)
                )
        }
        return actual === value
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
    let findPackages: jest.Mock
    let findBindings: jest.Mock
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
        findPackages = jest.fn(async ({ where }: { where: Where | Where[] }) =>
            packages.filter((record) => (Array.isArray(where) ? where : [where]).some((item) => matches(record, item)))
        )
        findBindings = jest.fn(async ({ where }: { where: Where | Where[] }) =>
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
            createQueryBuilder: () => {
                let where: Where | Where[]
                const query = {
                    select: () => query,
                    addSelect: () => query,
                    where: (value: Where | Where[]) => {
                        where = value
                        return query
                    },
                    getRawMany: () => findPackages({ where })
                }
                return query
            },
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
            {
                runtimeBindings: connectorReferences,
                runtimeBindingsBatch: jest.fn().mockResolvedValue(new Map())
            } as unknown as AgentPluginConnectorService
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

    it('loads and describes only the sorted page while preserving filtered totals and scope precedence', async () => {
        const original = packages[0]
        packages = ['c-visible', 'a-hidden', 'b-visible', 'd-visible'].map((name, index) => ({
            ...original,
            id: `package-${index}`,
            descriptor: {
                ...original.descriptor,
                name,
                extension: { version: 2, role: index === 1 ? 'assistant' : 'capability' }
            }
        }))
        const details = jest.spyOn(installations, 'catalogPackages')
        const connectors = jest.spyOn(installations, 'catalogConnectorReferences')
        const result = await runtime.catalog('assistant', { kind: 'agent_plugin', offset: 1, limit: 1 })
        expect(result.total).toBe(3)
        expect(result.items.map(({ title }) => title)).toEqual(['c-visible'])
        expect(details).toHaveBeenCalledWith(['package-0'])
        expect(connectors.mock.calls[0][0].map(({ pkg }) => pkg.id)).toEqual(['package-0'])
        await runtime.catalog('assistant', { kind: 'agent_plugin', search: 'no-match', limit: 1 })
        expect(details).toHaveBeenLastCalledWith([])
    })

    it('narrows targeted inventory reads while retaining organization overrides and immediate revocation', async () => {
        const organization = packages[0]
        const tenant = { ...organization, id: 'tenant-package', organizationId: null }
        const unrelated = {
            ...organization,
            id: 'unrelated',
            descriptor: { ...organization.descriptor, name: 'other' }
        }
        packages.push(tenant, unrelated, { ...organization, id: 'hidden', organizationId: 'other-org' })
        records.push(importedPluginBinding(organization), importedPluginBinding(unrelated))
        expect((await installations.installedCatalog(undefined, 'documents')).map(({ pkg }) => pkg.id)).toEqual([
            'package'
        ])
        expect(await findPackages.mock.results[0].value).toHaveLength(2)
        expect(await findBindings.mock.results[0].value).toHaveLength(1)
        records[0].enabled = false
        expect((await installations.installedCatalog(undefined, 'documents'))[0].binding.enabled).toBe(false)
        expect((await installations.installedCatalog(undefined, 'documents'))[0].pkg.id).toBe(organization.id)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('different-org')
        expect((await installations.installedCatalog(undefined, 'documents'))[0].pkg.id).toBe(tenant.id)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('different-tenant')
        expect(await installations.installedCatalog(undefined, 'documents')).toEqual([])
    })

    it('skips binding queries when no package with the requested name is visible', async () => {
        expect(await installations.installedCatalog(undefined, 'missing')).toEqual([])
        expect(findBindings).not.toHaveBeenCalled()
    })

    it('selects the same version and legacy workspace binding with a package filter as with the full inventory', async () => {
        const older = packages[0]
        const newer = { ...older, id: 'newer', digest: 'newer-digest', createdAt: new Date('2026-10-02') }
        packages.push(newer, { ...older, id: 'unrelated', descriptor: { ...older.descriptor, name: 'unrelated' } })
        const legacy = {
            ...importedPluginBinding(older),
            id: 'legacy',
            workspaceIds: ['workspace'],
            definition: { kind: 'agent_plugin' as const, packageId: older.id, experts: {} }
        }
        records.push(legacy)
        const targeted = () => installations.installedCatalog('workspace', 'documents')
        const full = async () =>
            (await installations.installedCatalog('workspace')).filter(({ pkg }) => pkg.descriptor.name === 'documents')
        expect(await targeted()).toEqual(await full())
        expect((await targeted())[0].pkg.id).toBe(newer.id)
        const configured = { ...importedPluginBinding(newer), enabled: false }
        records.push(configured)
        expect(await targeted()).toEqual(await full())
        expect((await targeted())[0].binding.enabled).toBe(false)
        packages.splice(packages.indexOf(newer), 1)
        records.splice(records.indexOf(configured), 1)
        expect(await targeted()).toEqual(await full())
        expect((await targeted())[0].binding.id).toBe(legacy.id)
    })

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
    it('offers a template-only package and lists each template without provisioning', async () => {
        packages[0].descriptor.skills = []
        packages[0].descriptor.templates = [
            { key: 'reviewer', path: 'reviewer.json' },
            { key: 'writer', path: 'writer.json' }
        ]
        packages[0].descriptor.templateCatalog = {
            reviewer: {
                name: 'reviewer',
                title: 'Reviewer',
                description: 'Review evidence',
                avatar: null,
                type: XpertTypeEnum.Agent
            },
            writer: {
                name: 'writer',
                title: 'Writer',
                description: 'Write a report',
                avatar: null,
                type: XpertTypeEnum.Agent
            }
        }
        const result = await runtime.catalog('assistant', { kind: 'agent_plugin' })
        expect(result.items[0]).toMatchObject({
            status: 'ready',
            components: [
                {
                    kind: 'assistant_template',
                    key: 'reviewer',
                    title: 'Reviewer',
                    description: 'Review evidence',
                    status: 'ready'
                },
                {
                    kind: 'assistant_template',
                    key: 'writer',
                    title: 'Writer',
                    description: 'Write a report',
                    status: 'ready'
                }
            ]
        })
        expect(install).not.toHaveBeenCalled()
    })
    it.each([undefined, 'capability', 'assistant', 'subagent'] as const)(
        'filters only assistant role %p from candidates without changing installed or selected resources',
        async (role) => {
            packages[0].descriptor.extension = { version: 2, role }
            const binding = importedPluginBinding(packages[0])
            const reference = selected(binding)
            const candidates = await runtime.catalog('assistant', { kind: 'agent_plugin' })
            expect(candidates.total).toBe(role === 'assistant' ? 0 : 1)
            expect(candidates.items).toHaveLength(candidates.total)
            expect((await installations.catalog()).items).toHaveLength(1)
            expect(await installations.installedCatalog()).toHaveLength(1)
            const restored = await runtime.catalog('assistant', { purpose: 'selection' })
            expect(restored.items[0]).toMatchObject({
                bindingId: binding.id,
                version: binding.version,
                title: 'documents',
                status: 'ready'
            })
            const resolved = await runtime.resolve('assistant', reference)
            expect(resolved.selection).toEqual(reference)
            expect(resolved.skillIds).toEqual(['skill-new-workspace'])
        }
    )
    it('filters assistant-role candidates before search totals and pagination', async () => {
        const original = packages[0]
        packages = ['a-template', 'b-visible', 'c-template', 'd-visible'].map((name, index) => ({
            ...original,
            id: `package-${index}`,
            descriptor: {
                ...original.descriptor,
                name,
                extension: { version: 2, role: index % 2 === 0 ? 'assistant' : 'capability' }
            }
        }))
        const page = await runtime.catalog('assistant', { offset: 1, limit: 1 })
        expect(page.total).toBe(2)
        expect(page.items.map((item) => item.title)).toEqual(['d-visible'])
        expect(await runtime.catalog('assistant', { search: 'template' })).toEqual({ items: [], total: 0 })
        expect((await runtime.catalog('assistant', { purpose: 'selection', search: 'template' })).total).toBe(2)
    })
    it('keeps a conversation pinned to its old package after an assistant-role upgrade', async () => {
        const previous = packages[0]
        const reference = selected(importedPluginBinding(previous))
        await runtime.resolve('assistant', reference)
        packages.unshift({
            ...previous,
            id: 'assistant-upgrade',
            digest: 'new-digest',
            createdAt: new Date('2026-10-02'),
            descriptor: { ...previous.descriptor, extension: { version: 2, role: 'assistant' } }
        })
        expect(await runtime.catalog('assistant', { kind: 'agent_plugin' })).toEqual({ items: [], total: 0 })
        expect((await runtime.resolve('assistant', reference)).selection).toEqual(reference)
        expect((await installations.reference(reference.resources[0])).pkg.id).toBe(previous.id)
        expect(install).toHaveBeenCalledTimes(1)
        records.push({ ...importedPluginBinding(packages[0]), enabled: false })
        await expect(runtime.resolve('assistant', reference)).rejects.toThrow()
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
