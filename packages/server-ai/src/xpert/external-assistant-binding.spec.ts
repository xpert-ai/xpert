import type { IXpert } from '@xpert-ai/contracts'
import {
    describeExternalAssistantBinding,
    directExternalAssistantIds,
    matchesExternalAssistantExpectation,
    safeExternalAssistantBinding
} from './external-assistant-binding'

const officialSource = {
    templateId: '@xpert-ai/plugin-bom-lifecycle:bom-lifecycle-bom-engineer',
    templateKey: 'bom-lifecycle-bom-engineer',
    pluginName: '@xpert-ai/plugin-bom-lifecycle'
}

function requester(): IXpert {
    return {
        id: 'orchestrator-1',
        name: 'orchestrator',
        title: 'BOM 全流程协同助手',
        organizationId: 'org-1',
        active: true,
        version: '40',
        agent: { key: 'Agent_LifecycleOrchestrator' },
        graph: {
            nodes: [
                { type: 'agent', key: 'Agent_LifecycleOrchestrator' },
                { type: 'xpert', key: 'bom-assistant-1' },
                { type: 'xpert', key: 'nested-assistant' }
            ],
            connections: [
                { type: 'xpert', from: 'Agent_LifecycleOrchestrator', to: 'bom-assistant-1', required: true },
                { type: 'xpert', from: 'Agent_Embedded', to: 'nested-assistant', required: true },
                { type: 'xpert', from: 'Agent_LifecycleOrchestrator', to: 'optional-assistant' }
            ]
        }
    } as IXpert
}

function candidate(overrides: Partial<IXpert> = {}): IXpert {
    return {
        id: 'bom-assistant-1',
        name: 'bom-engineer',
        title: 'BOM 工程助手（组织实例）',
        organizationId: 'org-1',
        active: true,
        publishAt: new Date('2026-09-01T00:00:00.000Z'),
        version: '10',
        agent: { key: 'Agent_BomEngineer' },
        graph: { nodes: [], connections: [] },
        options: { templateSource: officialSource },
        ...overrides
    } as IXpert
}

describe('external Assistant binding', () => {
    it('only returns required direct external Xperts connected to the selected root Agent', () => {
        expect(directExternalAssistantIds(requester(), 'Agent_LifecycleOrchestrator')).toEqual(['bom-assistant-1'])
        expect(directExternalAssistantIds(requester(), 'Agent_Embedded')).toEqual(['nested-assistant'])
    })

    it('describes a same-organization published official Assistant without leaking its id to the View Host', () => {
        const binding = describeExternalAssistantBinding(requester(), candidate())
        expect(binding).toMatchObject({
            xpertId: 'bom-assistant-1',
            title: 'BOM 工程助手（组织实例）',
            primaryAgentKey: 'Agent_BomEngineer',
            publishedVersion: '10',
            status: 'available',
            templateSource: officialSource
        })
        expect(
            matchesExternalAssistantExpectation(binding, {
                pluginName: '@xpert-ai/plugin-bom-lifecycle',
                templateKey: 'bom-lifecycle-bom-engineer',
                agentKey: 'Agent_BomEngineer'
            })
        ).toBe(true)
        expect(safeExternalAssistantBinding(binding)).not.toHaveProperty('xpertId')
    })

    it.each([
        ['unpublished', candidate({ graph: null })],
        ['cross_organization', candidate({ organizationId: 'org-2' })]
    ])('marks %s targets unavailable', (status, value) => {
        expect(describeExternalAssistantBinding(requester(), value).status).toBe(status)
    })

    it('rejects a wrong official template or wrong primary Agent as incompatible with the expected role', () => {
        const wrongTemplate = describeExternalAssistantBinding(
            requester(),
            candidate({
                options: { templateSource: { ...officialSource, templateKey: 'bom-lifecycle-commercial-engineer' } }
            })
        )
        const wrongAgent = describeExternalAssistantBinding(
            requester(),
            candidate({
                agent: { key: 'Agent_CommercialEngineer' }
            })
        )
        const expectation = {
            pluginName: '@xpert-ai/plugin-bom-lifecycle',
            templateKey: 'bom-lifecycle-bom-engineer',
            agentKey: 'Agent_BomEngineer'
        }
        expect(matchesExternalAssistantExpectation(wrongTemplate, expectation)).toBe(false)
        expect(matchesExternalAssistantExpectation(wrongAgent, expectation)).toBe(false)
    })
})
