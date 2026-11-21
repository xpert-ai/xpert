import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { LanguagesEnum } from '@xpert-ai/contracts'
import { AssistantCapabilityProviderRegistry, StrategyBus } from '@xpert-ai/plugin-sdk'
import { blankAssistantTemplate } from '../../../xpert-template/capabilities/blank-assistant-template'
import { parseCapabilityTemplateDraft } from '../../../xpert-template/capabilities/template-draft'
import { ProjectTasksCapabilityProvider } from '../project-tasks/project-tasks.capability'
import { PROJECT_CAPABILITY, ProjectCapabilityProvider } from './project.capability'

describe('Project management Assistant capability', () => {
    const provider = new ProjectCapabilityProvider()
    function context() {
        const template = blankAssistantTemplate([])
        const draft = parseCapabilityTemplateDraft(template.export_data)
        draft.nodes[0].entity = {
            ...draft.nodes[0].entity,
            prompt: 'User instructions',
            options: { parallelToolCalls: true }
        }
        return { template, draft, language: LanguagesEnum.English, loadTemplate: jest.fn() }
    }

    it('is discovered alongside Project tasks as a separate opt-in capability', async () => {
        const module = await Test.createTestingModule({
            imports: [DiscoveryModule],
            providers: [
                StrategyBus,
                AssistantCapabilityProviderRegistry,
                ProjectCapabilityProvider,
                ProjectTasksCapabilityProvider
            ]
        }).compile()
        await module.init()
        const registry = module.get(AssistantCapabilityProviderRegistry)
        expect(registry.get(PROJECT_CAPABILITY)).toBe(module.get(ProjectCapabilityProvider))
        expect(registry.list().map(({ key }) => key)).toEqual(
            expect.arrayContaining([PROJECT_CAPABILITY, 'project-tasks'])
        )
        await module.close()
    })

    it('independently enables project selection without tasks, CRUD, a sandbox or prompt changes', async () => {
        const input = context()
        expect(provider.isEnabled(input.draft)).toBe(false)
        await provider.apply(input)
        const once = structuredClone(input.draft)
        await provider.apply(input)
        expect(input.draft).toEqual(once)
        expect(input.draft.nodes).toHaveLength(2)
        expect(input.draft.nodes[1].entity).toMatchObject({ provider: 'ProjectMiddleware', options: {} })
        expect(input.draft.connections).toHaveLength(1)
        expect(input.draft.nodes[0].entity).toMatchObject({
            prompt: 'User instructions',
            options: { parallelToolCalls: true }
        })
        expect(input.draft.team.features?.sandbox).toBeUndefined()
        expect(input.loadTemplate).not.toHaveBeenCalled()
    })

    it.each([true, false])('reuses the selector when project management is composed first: %s', async (first) => {
        const input = context()
        const tasks = new ProjectTasksCapabilityProvider()
        for (const capability of first ? [provider, tasks] : [tasks, provider]) await capability.apply(input)
        expect(input.draft.nodes).toHaveLength(3)
        expect(input.draft.connections).toHaveLength(2)
        expect(provider.isEnabled(input.draft)).toBe(true)
        expect(tasks.isEnabled(input.draft)).toBe(true)
    })
})
