import type { AssistantCapabilityToolsetBinding } from '@xpert-ai/contracts'
import { bindCapabilityToolsets } from './capability-toolsets'
import { recordCapabilityState, removeCapabilityState } from './capability-state'
import { blankAssistantTemplate } from './blank-assistant-template'
import { parseCapabilityTemplateDraft } from './template-draft'

const binding: AssistantCapabilityToolsetBinding = {
    requirement: { bindingKey: 'sample.documents', category: 'mcp', requiredTools: ['find_documents'] },
    toolset: {
        id: 'documents',
        name: 'Documents',
        category: 'mcp',
        options: { capabilityBindingKey: 'sample.documents' }
    }
}
const fixture = () => parseCapabilityTemplateDraft(blankAssistantTemplate([]).export_data)

describe('capability toolset graph contributions', () => {
    it('binds once to the primary Agent and removes only owned contributions', () => {
        const before = fixture()
        const draft = structuredClone(before)
        bindCapabilityToolsets(draft, [binding, binding])
        expect(draft.nodes).toHaveLength(2)
        expect(draft.connections).toEqual([
            {
                key: 'Agent_Assistant/documents',
                from: 'Agent_Assistant',
                to: 'documents',
                type: 'toolset',
                required: true
            }
        ])
        recordCapabilityState(before, draft, ['documents'])
        const restored = removeCapabilityState(draft)
        expect(restored.nodes).toEqual(before.nodes)
        expect(restored.connections).toEqual(before.connections)
    })
    it('preserves manually bound resources and requires explicit sub-Agent targeting', () => {
        const before = fixture()
        bindCapabilityToolsets(before, [binding])
        before.nodes.push({
            key: 'child',
            type: 'agent',
            entity: { key: 'child', name: 'Child' },
            position: { x: 0, y: 0 }
        })
        const draft = structuredClone(before)
        bindCapabilityToolsets(draft, [
            { ...binding, requirement: { ...binding.requirement, targetAgentKey: 'child' } }
        ])
        recordCapabilityState(before, draft, ['documents'])
        expect(draft.connections).toHaveLength(2)
        expect(removeCapabilityState(draft).connections).toEqual(before.connections)
        expect(removeCapabilityState(draft).nodes).toEqual(before.nodes)
    })
    it('fails on collisions and edited owned nodes instead of overwriting them', () => {
        const draft = fixture()
        expect(() =>
            bindCapabilityToolsets(draft, [
                { ...binding, requirement: { ...binding.requirement, targetAgentKey: 'missing' } }
            ])
        ).toThrow()
        const before = structuredClone(draft)
        bindCapabilityToolsets(draft, [binding])
        recordCapabilityState(before, draft, ['documents'])
        const node = draft.nodes.find((node) => node.type === 'toolset')
        if (node?.type === 'toolset') node.entity.description = 'User edit'
        expect(() => removeCapabilityState(draft)).toThrow()
        expect(() =>
            bindCapabilityToolsets(fixture(), [{ ...binding, toolset: { ...binding.toolset, id: 'Agent_Assistant' } }])
        ).toThrow()
    })
})
