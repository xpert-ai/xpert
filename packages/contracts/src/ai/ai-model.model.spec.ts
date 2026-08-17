import {
  normalizeModelParameterValue,
  ParameterRule,
  ParameterType,
  resolveModelParameterOptions
} from './ai-model.model'

const label = { en_US: 'Parameter' }

function rule(input: Partial<ParameterRule> & Pick<ParameterRule, 'name' | 'type'>): ParameterRule {
  return { label, ...input }
}

describe('model parameter options', () => {
  it('fills each missing default without replacing saved values', () => {
    const options = resolveModelParameterOptions({ temperature: 0.3 }, [
      rule({ name: 'temperature', type: ParameterType.FLOAT, default: 0.7 }),
      rule({ name: 'enable_thinking', type: ParameterType.BOOLEAN, default: true })
    ])

    expect(options).toEqual({ temperature: 0.3, enable_thinking: true })
  })

  it('preserves explicit false and zero values', () => {
    const options = resolveModelParameterOptions({ enable_thinking: false, temperature: 0 }, [
      rule({ name: 'enable_thinking', type: ParameterType.BOOLEAN, default: true }),
      rule({ name: 'temperature', type: ParameterType.FLOAT, default: 0.7 })
    ])

    expect(options).toEqual({ enable_thinking: false, temperature: 0 })
  })

  it('normalizes boolean strings and falls back from invalid enum values', () => {
    const options = resolveModelParameterOptions({ enable_search: 'false', thinking: 'unsupported' }, [
      rule({ name: 'enable_search', type: ParameterType.BOOLEAN, default: true }),
      rule({
        name: 'thinking',
        type: ParameterType.STRING,
        options: ['enabled', 'disabled'],
        default: 'enabled'
      })
    ])

    expect(options).toEqual({ enable_search: false, thinking: 'enabled' })
  })

  it('parses and clamps numeric values', () => {
    expect(
      normalizeModelParameterValue(
        '12.8',
        rule({
          name: 'max_tokens',
          type: ParameterType.INT,
          min: 1,
          max: 10
        })
      )
    ).toBe(10)
    expect(
      normalizeModelParameterValue(
        '-0.5',
        rule({
          name: 'temperature',
          type: ParameterType.FLOAT,
          min: 0,
          max: 2
        })
      )
    ).toBe(0)
  })

  it('preserves options that are not described by parameter rules', () => {
    const options = resolveModelParameterOptions({ context_size: 128000, provider_option: 'value' }, [
      rule({ name: 'enable_thinking', type: ParameterType.BOOLEAN, default: true })
    ])

    expect(options).toEqual({
      context_size: 128000,
      provider_option: 'value',
      enable_thinking: true
    })
  })
})
