import { WorkflowNodeTypeEnum, type IWFNMiddleware, type IXpert, type TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { discoverRuntimeResources, type RuntimeResourceBinding } from './runtime-resource-discovery'
import { parseRuntimeResources } from './runtime-resource-selection'

const scope = { tenantId: 'tenant', organizationId: 'org' }
const assistant = {
    ...scope,
    id: 'assistant',
    workspaceId: 'workspace',
    slug: 'parent',
    type: 'agent',
    agent: { key: 'entry' }
} as IXpert
const expert = (id: string, slug = id, publishAt = '2026-09-21T00:00:00Z') => ({
    ...assistant,
    id,
    slug,
    name: id,
    publishAt: new Date(publishAt)
})
const meta = (name: string, extra: Partial<TAgentMiddlewareMeta> = {}): TAgentMiddlewareMeta => ({
    name,
    label: { en_US: name },
    ...extra
})

function discover(
    options: {
        experts?: IXpert[]
        middlewares?: TAgentMiddlewareMeta[]
        bindings?: RuntimeResourceBinding[]
        parent?: IXpert
        catalog?: boolean
        pluginVersion?: string
        organizationId?: string
    } = {}
) {
    const registry = {
        list: jest.fn(() => (options.middlewares ?? []).map((meta) => ({ meta }))),
        getSource: () => ({ kind: 'plugin', pluginName: 'test', pluginVersion: options.pluginVersion ?? '1' })
    }
    return discoverRuntimeResources({
        scope: { ...scope, organizationId: options.organizationId ?? scope.organizationId },
        assistant: options.parent ?? assistant,
        experts: options.experts ?? [],
        bindings: options.bindings ?? [],
        registry: registry as unknown as AgentMiddlewareRegistry,
        catalog: options.catalog ?? true
    })
}

describe('automatic runtime resource discovery', () => {
    beforeEach(() => jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue(undefined))
    afterEach(() => jest.restoreAllMocks())

    it('discovers published experts without managed bindings and generates compatible, scoped references', () => {
        const items = discover({ experts: [expert('expert-a'), expert('expert-b')] })
        expect(items).toHaveLength(2)
        const references = items.map(({ id, version }) => ({ bindingId: id, version }))
        expect(parseRuntimeResources({ revision: 0, resources: references }).resources).toEqual(references)
        expect(discover({ experts: [expert('expert-a')] })[0].id).toBe(items[0].id)
        expect(discover({ experts: [expert('expert-a')], organizationId: 'other' })[0].id).not.toBe(items[0].id)
    })

    it('hides self, configured experts and duplicate published versions but still resolves pinned historical versions', () => {
        const old = expert('expert-old', 'expert')
        const latest = expert('expert-new', 'expert', '2026-09-22T00:00:00Z')
        const configured = expert('configured')
        const experts = [expert('parent-old', 'parent'), old, latest, configured]
        const parent = { ...assistant, agent: { ...assistant.agent, collaborators: [configured] } }
        expect(discover({ experts, parent }).map((item) => item.title)).toEqual(['expert-new'])
        expect(discover({ experts, parent, catalog: false }).map((item) => item.title)).toContain('expert-old')
    })

    it('changes versions on in-place republication without changing the resource identity', () => {
        const before = discover({ experts: [expert('expert')] })[0]
        const after = discover({ experts: [expert('expert', 'expert', '2026-09-22T00:00:00Z')] })[0]
        expect(before.id).toBe(after.id)
        expect(before.version).not.toBe(after.version)
    })

    it('preserves full expert avatars and middleware icon definitions in discovery', () => {
        const avatar = { emoji: { id: 'rocket', unified: '1f680' }, background: 'transparent' }
        const icon = { type: 'svg' as const, value: '<svg viewBox="0 0 24 24"></svg>' }
        const items = discover({ experts: [{ ...expert('expert'), avatar }], middlewares: [meta('retry', { icon })] })
        expect(items.find((item) => item.definition.kind === 'external_xpert')?.avatar).toEqual(avatar)
        expect(items.find((item) => item.definition.kind === 'middleware')?.iconDefinition).toEqual(icon)
    })

    it('respects disabled managed experts instead of rediscovering them or another version of their family', () => {
        const experts = [expert('old', 'family'), expert('new', 'family')]
        const managed = discover({ experts, catalog: false })[0]
        expect(discover({ experts, bindings: [{ ...managed, enabled: false }] })).toEqual([])
        expect(discover({ experts, bindings: [{ ...managed, enabled: false }], catalog: false })).toEqual([])
        expect(discover({ experts, bindings: [managed], catalog: false })).toHaveLength(2)
    })

    it('offers valid defaults, isolates invalid schemas and excludes required unconfigured or internal providers', () => {
        const middlewares = [
            meta('empty'),
            meta('defaults', {
                configSchema: {
                    type: 'object',
                    properties: { retries: { type: 'number', default: 3 } },
                    required: ['retries']
                }
            }),
            meta('needs-config', {
                configSchema: { type: 'object', properties: { account: { type: 'string' } }, required: ['account'] }
            }),
            meta('invalid', { configSchema: { type: 'object', properties: { value: { $ref: 'missing' } } } }),
            meta('internal', { builtin: true }),
            meta('deprecated', { deprecated: true })
        ]
        const items = discover({ middlewares })
        expect(items.map((item) => item.title)).toEqual(['empty', 'defaults'])
        expect(items[1].definition).toEqual({ kind: 'middleware', provider: 'defaults', options: { retries: 3 } })
    })

    it('keeps configured presets authoritative and excludes graph middleware from discovery', () => {
        const middlewares = [meta('preset'), meta('existing')]
        const managed = discover({ middlewares })[0]
        const entity: IWFNMiddleware = {
            id: 'middleware',
            key: 'middleware',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: 'existing'
        }
        const parent: IXpert = {
            ...assistant,
            graph: {
                nodes: [{ key: 'middleware', type: 'workflow', position: { x: 0, y: 0 }, entity }],
                connections: [{ key: 'edge', type: 'workflow', from: 'entry', to: 'middleware' }]
            }
        }
        expect(discover({ middlewares, bindings: [{ ...managed, enabled: false }], parent })).toEqual([])
    })

    it('invalidates automatic middleware versions when the installed provider changes', () => {
        const middlewares = [meta('provider')]
        const before = discover({ middlewares })[0]
        const after = discover({ middlewares, pluginVersion: '2' })[0]
        expect(before.id).toBe(after.id)
        expect(before.version).not.toBe(after.version)
    })
})
