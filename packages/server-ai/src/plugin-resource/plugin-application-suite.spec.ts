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
