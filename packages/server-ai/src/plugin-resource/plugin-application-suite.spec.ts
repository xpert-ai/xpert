import type { IXpert, PluginMarketplaceAppAssistantSuite } from '@xpert-ai/contracts'
import {
    assertApplicationAssistantIdentity,
    connectApplicationSuite,
    validateApplicationSuite,
    verifyApplicationSuite
} from './plugin-application-suite'
const pluginName = '@example/material',
    suite: PluginMarketplaceAppAssistantSuite = {
        version: '1',
        coordinatorAgentKey: 'Agent_Coordinator',
        roles: [{ key: 'quality', templateKey: 'quality', primaryAgentKey: 'Agent_Quality' }]
    }
function assistant(id: string, templateKey: string, primary: string): IXpert {
    return {
        id,
        name: id,
        title: id,
        latest: true,
        publishAt: new Date(),
        agent: { key: primary },
        options: { templateSource: { pluginName, templateKey, templateId: `${pluginName}:${templateKey}` } },
        draft: {
            team: { name: id, agent: { key: primary } },
            nodes: [{ type: 'agent', key: primary, position: { x: 0, y: 0 }, entity: { key: primary, name: id } }],
            connections: []
        }
    } as IXpert
}
describe('governed application suite graph', () => {
    const standaloneSuite: PluginMarketplaceAppAssistantSuite = {
        ...suite,
        version: '2',
        standaloneAssistants: [{ key: 'master_data', templateKey: 'master-data', primaryAgentKey: 'Agent_MasterData' }]
    }
    it('validates standalone identities across both groups and bounds the total size', () => {
        expect(() => validateApplicationSuite(standaloneSuite, 'coordinator')).not.toThrow()
        expect(() => validateApplicationSuite({ ...suite, standaloneAssistants: suite.roles }, 'coordinator')).toThrow()
        expect(() =>
            validateApplicationSuite(
                {
                    ...suite,
                    standaloneAssistants: [
                        {
                            key: 'master_data',
                            templateKey: 'coordinator',
                            primaryAgentKey: 'Agent_MasterData'
                        }
                    ]
                },
                'coordinator'
            )
        ).toThrow()
        const invalid = { ...standaloneSuite }
        Reflect.set(invalid, 'standaloneAssistants', {})
        expect(() => validateApplicationSuite(invalid, 'coordinator')).toThrow('invalid_application_assistant_suite')
        const oversized = {
            ...suite,
            standaloneAssistants: Array.from({ length: 20 }, (_, i) => ({
                key: `standalone_${i}`,
                templateKey: `standalone-${i}`,
                primaryAgentKey: `Agent_Standalone${i}`
            }))
        }
        expect(() => validateApplicationSuite(oversized, 'coordinator')).toThrow('invalid_application_assistant_suite')
    })
    it('keeps published standalone Assistants outside the coordinator graph and remains idempotent', () => {
        const coordinator = assistant('coordinator', 'coordinator', 'Agent_Coordinator')
        const roles = new Map([
            ['quality', assistant('quality', 'quality', 'Agent_Quality')],
            ['master_data', assistant('master', 'master-data', 'Agent_MasterData')]
        ])
        const draft = connectApplicationSuite(coordinator, standaloneSuite, roles)
        expect(draft.nodes.filter((node) => node.type === 'xpert').map((node) => node.key)).toEqual(['quality'])
        expect(draft.connections).toHaveLength(1)
        expect(connectApplicationSuite({ ...coordinator, draft }, standaloneSuite, roles)).toEqual(draft)
        expect(() => verifyApplicationSuite({ ...coordinator, graph: draft }, standaloneSuite, roles)).not.toThrow()
        roles.get('master_data').publishAt = null
        expect(() => verifyApplicationSuite({ ...coordinator, graph: draft }, standaloneSuite, roles)).toThrow(
            'application_role_unpublished'
        )
        roles.delete('master_data')
        expect(() => connectApplicationSuite(coordinator, standaloneSuite, roles)).toThrow('application_role_missing')
    })
    it.each(['node', 'connection', 'alias'] as const)(
        'rejects an existing standalone %s without changing human edits',
        (kind) => {
            const coordinator = assistant('coordinator', 'coordinator', 'Agent_Coordinator')
            const master = assistant('master', 'master-data', 'Agent_MasterData')
            const roles = new Map([
                ['quality', assistant('quality', 'quality', 'Agent_Quality')],
                ['master_data', master]
            ])
            const draft = connectApplicationSuite(coordinator, standaloneSuite, roles)
            if (kind === 'connection') {
                draft.connections.push({ key: 'custom', type: 'xpert', from: 'Agent_Other', to: master.id })
            } else {
                draft.nodes.push({
                    type: 'xpert',
                    key: kind === 'alias' ? 'alias-master' : master.id,
                    entity: kind === 'alias' ? { ...master, id: 'alias-instance' } : master,
                    position: { x: 0, y: 0 }
                })
                if (kind === 'alias') {
                    master.draft.team.options = master.options
                    delete master.options
                }
            }
            const before = JSON.stringify(draft)
            expect(() => connectApplicationSuite({ ...coordinator, draft }, standaloneSuite, roles)).toThrow()
            expect(() => verifyApplicationSuite({ ...coordinator, graph: draft }, standaloneSuite, roles)).toThrow()
            expect(JSON.stringify(draft)).toBe(before)
        }
    )
    it('rejects ambiguous portable identities before installation', () => {
        expect(() =>
            validateApplicationSuite({ ...suite, roles: [...suite.roles, ...suite.roles] }, 'coordinator')
        ).toThrow('invalid_application_assistant_role')
        expect(() =>
            validateApplicationSuite(
                { ...suite, roles: [{ key: 'role', templateKey: 'coordinator', primaryAgentKey: 'Agent_Role' }] },
                'coordinator'
            )
        ).toThrow()
        expect(() => validateApplicationSuite(suite, 'coordinator')).not.toThrow()
    })
    it('does not adopt an Assistant that only has a matching display title', () => {
        const wrong = assistant('role', 'other-template', 'Agent_Quality')
        wrong.title = 'quality'
        expect(() => assertApplicationAssistantIdentity(wrong, pluginName, 'quality', 'Agent_Quality')).toThrow(
            'application_assistant_identity_mismatch'
        )
    })
    it('connects independent roles directly and requires the connection', () => {
        const coordinator = assistant('coordinator', 'coordinator', 'Agent_Coordinator'),
            role = assistant('quality', 'quality', 'Agent_Quality'),
            roles = new Map([['quality', role]])
        const draft = connectApplicationSuite(coordinator, suite, roles)
        expect(draft.nodes.filter((n) => n.type === 'agent')).toHaveLength(1)
        expect(draft.connections).toEqual([
            {
                key: 'Agent_Coordinator/quality',
                type: 'xpert',
                from: 'Agent_Coordinator',
                to: 'quality',
                required: true
            }
        ])
        expect(() => verifyApplicationSuite({ ...coordinator, graph: draft }, suite, roles)).not.toThrow()
        expect(coordinator.draft?.connections).toHaveLength(0)
    })
    it('rejects missing and optional published bindings', () => {
        const coordinator = assistant('coordinator', 'coordinator', 'Agent_Coordinator'),
            role = assistant('quality', 'quality', 'Agent_Quality'),
            roles = new Map([['quality', role]])
        const draft = connectApplicationSuite(coordinator, suite, roles)
        draft.connections[0].required = false
        expect(() => verifyApplicationSuite({ ...coordinator, graph: draft }, suite, roles)).toThrow(
            'application_suite_binding_missing'
        )
        role.publishAt = null
        expect(() => verifyApplicationSuite(coordinator, suite, roles)).toThrow('application_role_unpublished')
    })
})
