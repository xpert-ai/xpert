jest.mock('@xpert-ai/server-core', () => ({ RequestContext: {} }))
jest.mock('../../sandbox/sandbox.service', () => ({ SandboxService: class {} }))
import { LanguagesEnum } from '@xpert-ai/contracts'
import { blankAssistantTemplate } from './blank-assistant-template'
import { parseCapabilityTemplateDraft } from './template-draft'
import { DesktopShellCapabilityProvider } from './builtin-capabilities'
import { primaryAgent, recordCapabilityState, removeCapabilityState, updateAssistantPrompt } from './capability-state'

async function fixture() {
    const template = blankAssistantTemplate([])
    const before = parseCapabilityTemplateDraft(template.export_data)
    primaryAgent(before).entity.prompt = 'User role'
    primaryAgent(before).entity.options = { hidden: false, parallelToolCalls: true }
    const draft = structuredClone(before)
    await new DesktopShellCapabilityProvider().apply({
        draft,
        template,
        language: LanguagesEnum.English,
        loadTemplate: async () => template
    })
    recordCapabilityState(before, draft, ['desktop-shell'])
    return { before, draft }
}

describe('capability-owned configuration', () => {
    it('restores only owned changes and preserves edited instructions and unrelated nodes', async () => {
        const { before, draft } = await fixture()
        updateAssistantPrompt(draft, 'Edited role')
        draft.nodes.push({
            type: 'agent',
            key: 'Other',
            position: { x: 0, y: 0 },
            entity: { key: 'Other', name: 'other', prompt: 'keep' }
        })
        const restored = removeCapabilityState(JSON.parse(JSON.stringify(draft)))
        expect(primaryAgent(restored).entity.prompt).toBe('Edited role')
        expect(primaryAgent(restored).entity.options).toEqual(primaryAgent(before).entity.options)
        expect(restored.nodes.map((node) => node.key)).toEqual(['Agent_Assistant', 'Other'])
        expect(restored.connections).toEqual([])
    })
    it('does not erase capability nodes or edges modified in Studio', async () => {
        const { draft } = await fixture()
        const middleware = draft.nodes[1]
        if (middleware.type !== 'workflow') throw new Error('Expected middleware')
        middleware.entity.title = 'modified'
        expect(() => removeCapabilityState(draft)).toThrow()
        const { draft: connected } = await fixture()
        connected.connections.push({ key: 'custom', type: 'workflow', from: 'Other', to: connected.nodes[1].key })
        expect(() => removeCapabilityState(connected)).toThrow()
    })
    it('keeps generated instructions once when the user clears or rewrites their prompt', async () => {
        const { draft } = await fixture()
        const generated = draft.team.options.assistantCapabilities.instructions.trimStart()
        updateAssistantPrompt(draft, '')
        expect(primaryAgent(draft).entity.prompt).toBe(generated)
        expect(primaryAgent(removeCapabilityState(draft)).entity.prompt).toBe('')
        updateAssistantPrompt(draft, 'New')
        expect(primaryAgent(draft).entity.prompt).toBe(`New\n\n${generated}`)
    })
})
