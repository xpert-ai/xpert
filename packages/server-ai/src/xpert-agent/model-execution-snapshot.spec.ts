import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { AiModelTypeEnum, TCopilotModel } from '@xpert-ai/contracts'
import { createModelExecutionSnapshot, withModelExecutionSnapshot } from './model-execution-snapshot'

describe('model execution snapshots', () => {
    const primary: TCopilotModel = {
        copilotId: 'copilot',
        modelType: AiModelTypeEnum.LLM,
        model: 'primary',
        options: { context_size: 32768, context_size_source: 'provider', api_key: 'secret' }
    }

    it('freezes the context window without changing configuration or retaining credentials', () => {
        const snapshot = createModelExecutionSnapshot(primary)
        expect(snapshot?.options).toEqual({ context_size: 32768, context_size_source: 'snapshot' })
        expect(primary.options?.context_size_source).toBe('provider')
        expect(primary.options?.api_key).toBe('secret')
    })

    it('records the actual fallback window before the provider replies', async () => {
        const snapshots: Array<NonNullable<ReturnType<typeof createModelExecutionSnapshot>>> = []
        const record = async (snapshot: (typeof snapshots)[number]) => {
            snapshots.push(snapshot)
        }
        const failing = RunnableLambda.from(async () => {
            expect(snapshots[snapshots.length - 1]?.model).toBe('primary')
            throw new Error('primary unavailable')
        })
        const fallback = RunnableLambda.from(async () => {
            expect(snapshots[snapshots.length - 1]?.model).toBe('fallback')
            return new AIMessage('done')
        })
        const model = withModelExecutionSnapshot(failing, primary, record).withFallbacks([
            withModelExecutionSnapshot(
                fallback,
                { ...primary, model: 'fallback', options: { context_size: 131072 } },
                record
            )
        ])
        await expect(model.invoke([new HumanMessage('hello')])).resolves.toMatchObject({ content: 'done' })
        expect(snapshots.map((snapshot) => snapshot.options?.context_size)).toEqual([32768, 131072])
    })

    it('does not invent a snapshot for an incomplete model configuration', async () => {
        const record = jest.fn(async () => {})
        const model = withModelExecutionSnapshot(
            RunnableLambda.from(async () => new AIMessage('done')),
            { model: 'missing-copilot' },
            record
        )
        await expect(model.invoke([])).resolves.toMatchObject({ content: 'done' })
        expect(record).not.toHaveBeenCalled()
    })
})
