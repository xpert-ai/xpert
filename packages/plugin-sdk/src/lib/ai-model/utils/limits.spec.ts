import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts'
import { ChatOAICompatReasoningModel } from '../openai-compatible/completions'
import { applyModelContextSize, getModelContextSize } from './limits'

describe('model context window', () => {
  it.each(['gpt-6.1-sol', 'gpt-3.5-turbo'])('does not infer a window from the endpoint name %s', (model) => {
    const client = new ChatOAICompatReasoningModel({ apiKey: 'test-placeholder', model })

    expect(getModelContextSize(client)).toBeUndefined()
  })

  it.each([
    [256000, undefined, 256000],
    [256000, 32768, 32768],
    [8192, 256000, 8192],
    [undefined, '64000', 64000]
  ])('reconciles configured %s and declared %s windows to %s', (configured, declared, expected) => {
    const client = new ChatOAICompatReasoningModel({ apiKey: 'test-placeholder', model: 'custom-endpoint' })
    Object.assign(client, { profile: { maxInputTokens: declared, imageInputs: true } })
    const configuration: ICopilotModel = {
      model: 'custom-alias',
      modelType: AiModelTypeEnum.LLM,
      options: { context_size: typeof configured === 'number' ? configured : undefined, max_tokens: 4096 }
    }

    expect(applyModelContextSize(client, configuration)).toBe(client)
    expect(getModelContextSize(client)).toBe(expected)
    expect(getModelContextSize(configuration)).toBe(expected)
    expect(configuration.options.max_tokens).toBe(4096)
    expect(client).toHaveProperty('profile.imageInputs', true)
  })

  it('preserves legacy capabilities and other metadata while binding a smaller configured window', () => {
    const client = new ChatOAICompatReasoningModel({
      apiKey: 'test-placeholder',
      model: 'custom',
      metadata: { traceLabel: 'keep', profile: { maxInputTokens: '128000', toolCalling: true } }
    })
    const configuration: ICopilotModel = { options: { context_size: 64000 } }

    applyModelContextSize(client, configuration)

    expect(getModelContextSize(client)).toBe(64000)
    expect(client.metadata).toEqual({
      traceLabel: 'keep',
      profile: { maxInputTokens: 64000, toolCalling: true }
    })
    expect(client).toHaveProperty('profile.toolCalling', true)
  })

  it.each([undefined, null, {}, { maxInputTokens: 0 }, { maxInputTokens: -1 }, { maxInputTokens: 'invalid' }])(
    'ignores absent or invalid profile limits without inventing a window: %j',
    (profile) => {
      const client = new ChatOAICompatReasoningModel({ apiKey: 'test-placeholder', model: 'custom' })
      Object.assign(client, { profile, metadata: { profile: null } })
      const configuration: ICopilotModel = { options: { max_tokens: 4096 } }

      applyModelContextSize(client, configuration)

      expect(getModelContextSize(client)).toBeUndefined()
      expect(configuration.options).toEqual({ max_tokens: 4096 })
    }
  )

  it('uses the smaller explicit limit when legacy and current client profiles disagree', () => {
    const client = new ChatOAICompatReasoningModel({
      apiKey: 'test-placeholder',
      model: 'custom',
      metadata: { profile: { maxInputTokens: 64000 } }
    })
    Object.assign(client, { profile: { maxInputTokens: 128000 } })

    expect(getModelContextSize(client)).toBe(64000)
  })
})
