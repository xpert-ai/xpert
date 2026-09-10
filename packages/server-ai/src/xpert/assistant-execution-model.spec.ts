import type {
    IXpertAgent,
    IXpertAgentExecution,
    TAssistantPrimaryModelSelection,
    TChatRequest
} from '@xpert-ai/contracts'
import { resolveAssistantExecutionModel } from './assistant-execution-model'
import { resolveEffectiveCopilotModel } from '../xpert-agent/effective-copilot-model'

describe('Assistant execution model selection', () => {
    const input = {
        request: { action: 'send', message: { input: { input: 'Write a chapter' } } } as TChatRequest,
        xpert: { id: 'assistant', agent: { key: 'primary' } as IXpertAgent },
        runtimeAgentKey: 'authoring',
        input: null,
        sourceExecution: null,
        isDraft: false
    }
    const snapshot = { copilotId: 'provider', model: 'original', options: { temperature: 0.2 } }

    it('uses primaryModelId for a directly invoked task', async () => {
        const selection: TAssistantPrimaryModelSelection = { id: 'selected', model: snapshot, source: 'explicit' }
        const service = { resolveSelection: jest.fn().mockResolvedValue(selection) }
        await expect(resolveAssistantExecutionModel(service, { ...input, primaryModelId: 'selected' })).resolves.toBe(
            selection
        )
        expect(service.resolveSelection).toHaveBeenCalledWith(input.xpert, {
            explicitModelId: 'selected',
            ignorePreference: true
        })
    })

    it('does not apply Primary preferences to ordinary child Agent runs', async () => {
        const service = { resolveSelection: jest.fn() }
        await expect(resolveAssistantExecutionModel(service, input)).resolves.toBeNull()
        expect(service.resolveSelection).not.toHaveBeenCalled()
    })

    it('propagates model access rejection', async () => {
        const service = { resolveSelection: jest.fn().mockRejectedValue(new Error('model not allowed')) }
        await expect(resolveAssistantExecutionModel(service, { ...input, primaryModelId: 'removed' })).rejects.toThrow(
            'model not allowed'
        )
    })

    it.each(['resume', 'retry'] as const)('uses only persisted primary metadata for child task %s', async (action) => {
        const sourceExecution = {
            metadata: { primaryModelId: 'selected', primaryModelSnapshot: snapshot, primaryModelSource: 'explicit' }
        } as IXpertAgentExecution
        const service = {
            resolveSelection: jest.fn().mockResolvedValue({ id: 'selected', model: snapshot, source: 'retry' })
        }
        await resolveAssistantExecutionModel(service, {
            ...input,
            request: { action } as TChatRequest,
            sourceExecution
        })
        expect(service.resolveSelection).toHaveBeenCalledWith(
            input.xpert,
            action === 'resume'
                ? {
                      continuationModelId: 'selected',
                      continuationModelSnapshot: snapshot,
                      continuationSource: 'explicit',
                      ignorePreference: false
                  }
                : { retryModelId: 'selected', retryModelSnapshot: snapshot, ignorePreference: false }
        )
    })

    it.each(['explicit', 'preference', 'default', 'fallback'] as const)(
        'preserves %s inheritance across repeated retries and resume',
        async (origin) => {
            let sourceExecution = {
                metadata: { primaryModelId: 'selected', primaryModelSnapshot: snapshot, primaryModelSource: origin }
            } as IXpertAgentExecution
            for (const action of ['retry', 'retry', 'resume'] as const) {
                const service = {
                    resolveSelection: jest.fn().mockResolvedValue({
                        id: 'selected',
                        model: snapshot,
                        source: action === 'retry' ? 'retry' : origin
                    })
                }
                const selection = await resolveAssistantExecutionModel(service, {
                    ...input,
                    request: { action } as TChatRequest,
                    sourceExecution
                })
                expect(selection?.source).toBe(origin)
                const authored = { copilotId: 'base-provider', model: 'base' }
                const effective = resolveEffectiveCopilotModel(
                    { ...input.xpert, copilotModel: authored } as never,
                    { key: 'authoring' } as never,
                    {
                        xpertId: 'assistant',
                        primaryAgentKey: 'primary',
                        primaryCopilotModel: selection?.model,
                        primaryModelSource: selection?.source
                    }
                )
                expect(effective).toEqual(origin === 'explicit' || origin === 'preference' ? snapshot : authored)
                sourceExecution = {
                    metadata: {
                        primaryModelId: selection?.id,
                        primaryModelSnapshot: selection?.model,
                        primaryModelSource: selection?.source
                    }
                } as IXpertAgentExecution
            }
        }
    )

    it('keeps fallback semantics when the previously selected model is unavailable', async () => {
        const fallback: TAssistantPrimaryModelSelection = { id: 'default', model: snapshot, source: 'fallback' }
        const service = { resolveSelection: jest.fn().mockResolvedValue(fallback) }
        const sourceExecution = {
            metadata: { primaryModelId: 'removed', primaryModelSource: 'explicit' }
        } as IXpertAgentExecution
        await expect(
            resolveAssistantExecutionModel(service, {
                ...input,
                request: { action: 'retry' } as TChatRequest,
                sourceExecution
            })
        ).resolves.toBe(fallback)
    })
})
