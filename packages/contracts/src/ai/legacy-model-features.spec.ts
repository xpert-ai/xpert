import { ModelFeature } from './ai-model.model'
import { legacyModelFeatures } from './model-discovery.model'

describe('legacy model features', () => {
  it.each([null, undefined, {}])('keeps missing declarations empty: %p', (properties) => {
    expect(legacyModelFeatures(properties)).toEqual([])
  })

  it('preserves explicit vision, tool calling and agent thought declarations', () => {
    expect(
      legacyModelFeatures({
        vision_support: 'support',
        function_calling_type: 'tool_call',
        agent_though_support: 'supported'
      })
    ).toEqual([ModelFeature.VISION, ModelFeature.TOOL_CALL, ModelFeature.AGENT_THOUGHT])
  })

  it('converts an explicit streaming declaration without inferring ordinary or parallel tool support', () => {
    expect(legacyModelFeatures({ stream_function_calling: 'supported' })).toEqual([ModelFeature.STREAM_TOOL_CALL])
  })

  it.each(['not_supported', 'unsupported', undefined, null, true, 'true', 'support'])(
    'does not enable streaming for %p',
    (stream_function_calling) => {
      expect(legacyModelFeatures({ function_calling_type: 'tool_call', stream_function_calling })).toEqual([
        ModelFeature.TOOL_CALL
      ])
    }
  )

  it('requires an explicit multi_tool_call declaration and does not infer streaming support from it', () => {
    expect(legacyModelFeatures({ function_calling_type: 'multi_tool_call' })).toEqual([
      ModelFeature.TOOL_CALL,
      ModelFeature.MULTI_TOOL_CALL
    ])
    expect(legacyModelFeatures({ function_calling_type: 'tool_call', stream_function_calling: 'supported' })).toEqual([
      ModelFeature.TOOL_CALL,
      ModelFeature.STREAM_TOOL_CALL
    ])
  })

  it.each(['function_call', 'no_call', 'unknown', true])(
    'does not infer tool calling for %p',
    (function_calling_type) => {
      expect(legacyModelFeatures({ function_calling_type })).toEqual([])
    }
  )
})
