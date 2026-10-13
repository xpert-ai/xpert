import { IsNull } from 'typeorm'
import { agentPluginScopeWhere, visibleAgentPluginScopes } from './agent-plugin-scope'
import { importedPluginBinding, installedPluginBindings } from './installed-plugin-catalog'
import type { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'

const scope = { tenantId: 'tenant', organizationId: 'org' }
const pkg = (id: string, organizationId: string | null = 'org', name = 'documents'): AgentPluginPackage => ({
    id,
    ...scope,
    organizationId,
    rootPath: '/plugins',
    digest: id,
    source: { kind: 'zip' },
    createdAt: new Date('2026-10-01'),
    descriptor: { name, skills: [], servers: [], diagnostics: [] }
})
const legacy = (source: AgentPluginPackage, workspaceId = 'original'): AgentResourceBinding => ({
    ...importedPluginBinding(source),
    id: `legacy-${source.id}`,
    workspaceIds: [workspaceId],
    definition: { kind: 'agent_plugin', packageId: source.id, experts: { writer: 'expert' } },
    expertVersions: { expert: 'revision' },
    installations: {
        [workspaceId]: {
            skills: ['skill'],
            toolsets: ['toolset'],
            connectors: { remote: { bindingId: 'connection', provider: 'provider' } }
        }
    }
})

describe('installed Agent Plugin scope catalog', () => {
    it('uses explicit IS NULL for tenant records, never an unscoped organization query', () => {
        expect(agentPluginScopeWhere({ tenantId: 'tenant', organizationId: null })).toEqual({
            tenantId: 'tenant',
            organizationId: IsNull()
        })
        expect(visibleAgentPluginScopes(scope)).toEqual([scope, { tenantId: 'tenant', organizationId: IsNull() }])
    })
    it('makes imported packages visible without any workspace or publication', () => {
        const source = pkg('new')
        const [binding] = installedPluginBindings([source], [], scope)
        expect(binding).toMatchObject({
            enabled: true,
            workspaceIds: [],
            installations: {},
            definition: { availability: 'scope' }
        })
        expect(installedPluginBindings([source], [], scope, 'unrelated')[0]).toEqual(binding)
        expect(binding.id).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-5[a-f\d]{3}-8[a-f\d]{3}-[a-f\d]{12}$/)
    })
    it('inherits tenant packages and excludes other tenants and organizations', () => {
        const tenant = pkg('tenant-package', null)
        const local = pkg('organization-package', 'org', 'writer')
        const otherOrg = pkg('foreign-org', 'other', 'private')
        const otherTenant = { ...pkg('foreign-tenant', null, 'foreign'), tenantId: 'other' }
        const bindings = installedPluginBindings([tenant, local, otherOrg, otherTenant], [], scope)
        expect(
            bindings.map((binding) => binding.definition.kind === 'agent_plugin' && binding.definition.packageId).sort()
        ).toEqual(['organization-package', 'tenant-package'])
    })
    it('prefers the organization package and does not fall back to tenant when disabled', () => {
        const shared = pkg('shared', null)
        const local = pkg('local')
        const disabled = { ...importedPluginBinding(local), enabled: false }
        expect(installedPluginBindings([shared, local], [disabled], scope)).toEqual([disabled])
        expect(installedPluginBindings([shared, local], [disabled], { ...scope, organizationId: 'other' })).toEqual([
            importedPluginBinding(shared)
        ])
    })
    it('retains workspace-specific legacy references and connections without restricting visibility', () => {
        const source = pkg('existing')
        const original = legacy(source)
        const second = { ...legacy(source, 'second'), id: 'second-binding' }
        const before = structuredClone([original, second])
        expect(installedPluginBindings([source], [original, second], scope, 'original')[0]).toBe(original)
        expect(installedPluginBindings([source], [original, second], scope, 'second')[0]).toBe(second)
        expect(installedPluginBindings([source], [original], scope, 'new-workspace')[0]).toBe(original)
        expect([original, second]).toEqual(before)
    })
    it('keeps old versions intact while a later import becomes available', () => {
        const old = pkg('old')
        const original = legacy(old)
        const recent = { ...pkg('new'), createdAt: new Date('2026-10-12') }
        expect(installedPluginBindings([recent, old], [original], scope)[0]).toEqual(importedPluginBinding(recent))
        expect(original.definition).toMatchObject({ packageId: 'old' })
        expect(original.expertVersions).toEqual({ expert: 'revision' })
    })
})
