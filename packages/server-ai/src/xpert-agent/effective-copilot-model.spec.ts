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

    it('uses the Agent model first and falls back to the team model', () => {
        expect(
            resolveEffectiveCopilotModel(team as never, { key: 'primary', copilotModel: selected } as never, {})
        ).toEqual(selected)
        expect(resolveEffectiveCopilotModel(team as never, { key: 'primary' } as never, {})).toEqual(configured)
    })

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
                primaryModelSource: 'explicit' as const,
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
                    primaryModelSource: 'explicit' as const,
                    primaryCopilotModel: selected
                }
            )
        ).toEqual(configured)
    })

    it.each(['subagent', 'swarm-member', 'direct-task-target'])(
        '%s inherits the selected Assistant base only without an authored model',
        (key) => {
            const options = {
                xpertId: team.id,
                primaryAgentKey: 'primary',
                primaryModelSource: 'explicit' as const,
                primaryCopilotModel: selected
            }
            expect(resolveEffectiveCopilotModel(team as never, { key } as never, options)).toEqual(selected)
            expect(
                resolveEffectiveCopilotModel(team as never, { key, copilotModel: configured } as never, options)
            ).toEqual(configured)
        }
    )

    it('keeps nested Assistant base inheritance local even when Agent keys match', () => {
        expect(
            resolveEffectiveCopilotModel({ ...team, id: 'nested-assistant' } as never, { key: 'primary' } as never, {
                xpertId: team.id,
                primaryAgentKey: 'primary',
                primaryModelSource: 'explicit' as const,
                primaryCopilotModel: selected
            })
        ).toEqual(configured)
    })

    it.each(['default', 'fallback', undefined] as const)('keeps authored base for source %s', (primaryModelSource) => {
        const options = {
            xpertId: team.id,
            primaryAgentKey: 'primary',
            primaryCopilotModel: selected,
            primaryModelSource
        }
        expect(resolveEffectiveCopilotModel(team as never, { key: 'subagent' } as never, options)).toEqual(configured)
        expect(
            resolveEffectiveCopilotModel(team as never, { key: 'primary', copilotModel: configured } as never, options)
        ).toEqual(selected)
    })
})
