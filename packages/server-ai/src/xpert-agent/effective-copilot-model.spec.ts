import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { resolveEffectiveCopilotModel } from './effective-copilot-model'

describe('resolveEffectiveCopilotModel', () => {
    const configured = {
        copilotId: 'provider-a',
        modelType: AiModelTypeEnum.LLM,
        model: 'configured'
    }
    const selected = {
        copilotId: 'provider-b',
        modelType: AiModelTypeEnum.LLM,
        model: 'selected'
    }
    const team = { id: 'assistant-1', copilotModel: configured }

    it('overrides only the root Assistant Primary Agent', () => {
        expect(
            resolveEffectiveCopilotModel(team as never, { key: 'primary', copilotModel: configured } as never, {
                xpertId: 'assistant-1',
                primaryAgentKey: 'primary',
                primaryCopilotModel: selected
            })
        ).toEqual(selected)
    })

    it('keeps configured models for subagents and nested Assistant graphs', () => {
        expect(
            resolveEffectiveCopilotModel(team as never, { key: 'subagent', copilotModel: configured } as never, {
                xpertId: 'assistant-1',
                primaryAgentKey: 'primary',
                primaryCopilotModel: selected
            })
        ).toEqual(configured)
        expect(
            resolveEffectiveCopilotModel(
                { ...team, id: 'nested-assistant' } as never,
                { key: 'primary', copilotModel: configured } as never,
                {
                    xpertId: 'assistant-1',
                    primaryAgentKey: 'primary',
                    primaryCopilotModel: selected
                }
            )
        ).toEqual(configured)
    })
})
