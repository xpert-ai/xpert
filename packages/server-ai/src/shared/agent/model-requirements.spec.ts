import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { ModelFeature } from '@xpert-ai/contracts'
import { mergeModelRequirements, type WrapModelCallHandler } from '@xpert-ai/plugin-sdk'
import i18next from 'i18next'
import { setModelVisionSupport } from '../../copilot-model/model-capabilities'
import { prepareModelCall } from './model-call'
import { snapshotModelRequirements, withModelRequirements } from './model-requirements'

const vision = { features: [ModelFeature.VISION] as const }
type ModelCallRequest = Parameters<WrapModelCallHandler>[0]
function request(requirements?: ModelCallRequest['requirements']): ModelCallRequest {
    return {
        model: RunnableLambda.from(async () => new AIMessage('response')),
        messages: [new HumanMessage('inspect')],
        tools: [],
        state: { messages: [] },
        runtime: {},
        requirements
    }
}

describe('model requirement composition', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })

    it('merges public SDK contributions without modifying caller-owned arrays', () => {
        const result = mergeModelRequirements(vision, undefined, vision, { features: [] })
        expect(result).toEqual(vision)
        expect(result).not.toBe(vision)
        expect(result.features).not.toBe(vision.features)
        expect(vision.features).toEqual([ModelFeature.VISION])
    })

    it('does not introduce requirements for ordinary calls', () => {
        expect(mergeModelRequirements(undefined, {}, { features: [] })).toBeUndefined()
    })

    it('validates, deduplicates and freezes a detached snapshot', () => {
        const input = { features: [ModelFeature.VISION, ModelFeature.VISION] }
        const snapshot = snapshotModelRequirements(input)
        input.features.length = 0
        expect(snapshot).toEqual(vision)
        expect(Object.isFrozen(snapshot)).toBe(true)
        expect(Object.isFrozen(snapshot.features)).toBe(true)
    })

    it.each([
        null,
        [],
        { features: 'vision' },
        { features: [ModelFeature.VIDEO] },
        { features: ['unknown'] },
        { features: [null] },
        { features: [ModelFeature.VISION], arbitrary: true }
    ])('rejects unsupported or malformed plugin requirements: %j', (input) => {
        expect(() => snapshotModelRequirements(input)).toThrow('requirements are invalid')
    })

    it('retains an upstream requirement even if later middleware clears or omits it', async () => {
        const terminal = jest.fn(async (_request: ModelCallRequest) => new AIMessage('done'))
        const chain = withModelRequirements(
            (input, next) => next({ ...input, requirements: vision }),
            withModelRequirements(
                (input, next) => next({ ...input, requirements: { features: [] } }),
                withModelRequirements((input, next) => {
                    const { requirements: _requirements, ...withoutRequirements } = input
                    return next(withoutRequirements)
                }, terminal)
            )
        )
        const original = request()
        await chain(original)
        expect(terminal.mock.calls[0][0].requirements).toEqual(vision)
        expect(original.requirements).toBeUndefined()
    })

    it('isolates concurrent calls and repeated handler attempts on a reused middleware', async () => {
        const terminal = jest.fn(async (_request: ModelCallRequest) => new AIMessage('done'))
        const chain = withModelRequirements(async (input, next) => {
            await Promise.resolve()
            await next({ ...input, requirements: undefined })
            return next({ ...input, requirements: { features: [] } })
        }, terminal)
        const required = request(vision)
        const ordinary = request()
        await Promise.all([chain(required), chain(ordinary)])
        const calls = terminal.mock.calls.map(([input]) => input)
        expect(
            calls.filter((input) => input.messages === required.messages).map((input) => input.requirements)
        ).toEqual([vision, vision])
        expect(
            calls.filter((input) => input.messages === ordinary.messages).map((input) => input.requirements)
        ).toEqual([undefined, undefined])
    })

    it('enforces inherited requirements at the actual model boundary despite a downgrade attempt', async () => {
        const invoke = jest.fn(async () => new AIMessage('must not inspect'))
        const model = setModelVisionSupport(RunnableLambda.from(invoke), false)
        const chain = withModelRequirements(
            (input, next) => next({ ...input, requirements: undefined }),
            async (input) => {
                const prepared = await prepareModelCall(input, {
                    registeredTools: [],
                    agent: {
                        options: { errorHandling: { type: 'defaultValue', defaultValue: { content: 'looks safe' } } }
                    }
                })
                return prepared.model.invoke(prepared.messages)
            }
        )
        await expect(chain({ ...request(vision), model })).rejects.toThrow('requires image input support')
        expect(invoke).not.toHaveBeenCalled()
    })
})
