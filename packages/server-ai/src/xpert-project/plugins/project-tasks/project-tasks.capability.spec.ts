import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { IWFNMiddleware, LanguagesEnum, TXpertTeamDraft, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AssistantCapabilityProviderRegistry, StrategyBus } from '@xpert-ai/plugin-sdk'
import { blankAssistantTemplate } from '../../../xpert-template/capabilities/blank-assistant-template'
import {
    recordCapabilityState,
    removeCapabilityState,
    updateAssistantPrompt
} from '../../../xpert-template/capabilities/capability-state'
import { parseCapabilityTemplateDraft } from '../../../xpert-template/capabilities/template-draft'
import { PROJECT_TASKS_MIDDLEWARE } from './constants'
import { ProjectTasksCapabilityProvider } from './project-tasks.capability'

function context() {
    const template = blankAssistantTemplate([])
    const draft = parseCapabilityTemplateDraft(template.export_data)
    draft.nodes[0].entity = { ...draft.nodes[0].entity, prompt: 'User instructions' }
    return { template, draft, language: LanguagesEnum.English, loadTemplate: jest.fn() }
}

describe('Project management Assistant capability', () => {
    const provider = new ProjectTasksCapabilityProvider()

    it('is discovered by the shared capability registry', async () => {
        const module = await Test.createTestingModule({
            imports: [DiscoveryModule],
            providers: [StrategyBus, AssistantCapabilityProviderRegistry, ProjectTasksCapabilityProvider]
        }).compile()
        await module.init()
        expect(module.get(AssistantCapabilityProviderRegistry).get(PROJECT_TASKS_MIDDLEWARE)).toBe(
            module.get(ProjectTasksCapabilityProvider)
        )
        await module.close()
    })

    it('connects the built-in tools to the primary Agent once without creating an execution environment', async () => {
        const input = context()
        await provider.apply(input)
        const once = structuredClone(input.draft)
        await provider.apply(input)
        expect(input.draft).toEqual(once)
        expect(input.draft.nodes).toHaveLength(2)
        expect(input.draft.nodes[1].entity).toMatchObject({
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: PROJECT_TASKS_MIDDLEWARE,
            required: true,
            options: {}
        })
        expect(input.draft.connections).toEqual([
            expect.objectContaining({
                from: 'Agent_Assistant',
                to: input.draft.nodes[1].key,
                type: 'workflow',
                required: true
            })
        ])
        expect(provider.isEnabled(input.draft)).toBe(true)
        expect(input.draft.nodes[0].entity).toMatchObject({
            prompt: expect.stringContaining('Runtime success is not task acceptance'),
            options: { parallelToolCalls: false }
        })
        expect(input.draft.team.features?.sandbox).toBeUndefined()
        expect(input.loadTemplate).not.toHaveBeenCalled()
    })

    it('does not mistake a child-only or disconnected middleware for the primary Agent capability', async () => {
        const input = context()
        await provider.apply(input)
        input.draft.connections[0].from = 'child'
        expect(provider.isEnabled(input.draft)).toBe(false)
        await provider.apply(input)
        expect(new Set(input.draft.nodes.map(({ key }) => key)).size).toBe(input.draft.nodes.length)
        expect(input.draft.connections).toHaveLength(2)
        expect(input.draft.connections[0].from).toBe('child')
        expect(provider.isEnabled(input.draft)).toBe(true)
    })

    it('preserves existing Studio tool selection and middleware settings', async () => {
        const input = context()
        await provider.apply(input)
        const node = input.draft.nodes[1]
        if (node.type !== 'workflow' || node.entity.type !== WorkflowNodeTypeEnum.MIDDLEWARE)
            throw new Error('middleware missing')
        const entity: IWFNMiddleware = {
            ...node.entity,
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: PROJECT_TASKS_MIDDLEWARE,
            required: false,
            tools: { project_dispatch_task: false }
        }
        node.entity = entity
        const before = structuredClone(input.draft)
        await provider.apply(input)
        expect(input.draft).toEqual(before)
    })

    it('can be turned off while preserving user instructions and unrelated workflow nodes', async () => {
        const input = context()
        const before = structuredClone(input.draft)
        await provider.apply(input)
        recordCapabilityState(before, input.draft, [provider.key])
        updateAssistantPrompt(input.draft, 'Updated instructions')
        const unrelated: TXpertTeamDraft['nodes'][number] = {
            type: 'agent',
            key: 'unrelated',
            position: { x: 0, y: 0 },
            entity: { key: 'unrelated', prompt: 'Keep me' }
        }
        input.draft.nodes.push(unrelated)
        const restored = removeCapabilityState(input.draft)
        expect(provider.isEnabled(restored)).toBe(false)
        expect(restored.nodes).toHaveLength(2)
        expect(restored.nodes[0].entity).toMatchObject({ prompt: 'Updated instructions' })
        expect(restored.nodes[1]).toEqual(unrelated)
        expect(restored.connections).toEqual([])
        expect(restored.team.options?.assistantCapabilities).toBeUndefined()
    })

    it('rejects a draft without its declared primary Agent', async () => {
        const input = context()
        input.draft.team.agent.key = 'missing'
        await expect(provider.apply(input)).rejects.toThrow()
        expect(input.draft.nodes).toHaveLength(1)
        expect(input.draft.connections).toEqual([])
    })
})
