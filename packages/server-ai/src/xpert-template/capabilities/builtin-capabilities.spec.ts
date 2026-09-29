jest.mock('../../sandbox/sandbox.service', () => ({ SandboxService: class SandboxService {} }))

import { LanguagesEnum } from '@xpert-ai/contracts'
import { SandboxService } from '../../sandbox/sandbox.service'
import { blankAssistantTemplate } from './blank-assistant-template'
import { DesktopShellCapabilityProvider, SandboxToolsCapabilityProvider } from './builtin-capabilities'
import { parseCapabilityTemplateDraft } from './template-draft'

function context() {
    const template = blankAssistantTemplate([])
    return {
        template,
        draft: parseCapabilityTemplateDraft(template.export_data),
        language: LanguagesEnum.English,
        loadTemplate: jest.fn()
    }
}

describe('blank Assistant built-in capabilities', () => {
    it('enables only local shell middleware without turning on a server sandbox or bypassing approval', async () => {
        const input = context()
        const provider = new DesktopShellCapabilityProvider()
        await provider.apply(input)
        await provider.apply(input)
        expect(input.draft.nodes).toHaveLength(2)
        expect(input.draft.connections).toEqual([
            expect.objectContaining({ from: 'Agent_Assistant', to: 'Capability_DesktopShell', required: true })
        ])
        expect(input.draft.nodes[0].entity).toMatchObject({ prompt: expect.stringContaining('requests approval') })
        expect(input.draft.team.features?.sandbox?.enabled).not.toBe(true)
    })
    it('requires an available sandbox and preserves an already selected provider', async () => {
        const sandbox = {
            listProviders: jest.fn(async () => [{ type: 'configured-sandbox' }]),
            getDefaultProviderType: jest.fn(async () => 'configured-sandbox')
        }
        const provider = new SandboxToolsCapabilityProvider(sandbox as unknown as SandboxService)
        const input = context()
        expect((await provider.check(input)).available).toBe(true)
        await provider.apply(input)
        expect(input.draft.team.features?.sandbox).toEqual({ enabled: true, provider: 'configured-sandbox' })
        expect(input.draft.nodes).toHaveLength(3)
        expect((await provider.check({ ...input, sandboxProviders: [{ type: 'different-provider' }] })).available).toBe(
            false
        )
        sandbox.listProviders.mockResolvedValue([])
        expect((await provider.check(input)).available).toBe(false)
    })
})
