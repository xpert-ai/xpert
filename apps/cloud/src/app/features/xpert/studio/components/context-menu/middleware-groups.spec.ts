import { TAgentMiddlewareDescriptor } from '@xpert-ai/contracts'
import { groupAgentMiddlewares } from './middleware-groups'

const localize = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && 'en_US' in value) {
    const enUS = value.en_US
    return typeof enUS === 'string' ? enUS : ''
  }
  return ''
}

describe('groupAgentMiddlewares', () => {
  const middlewares: TAgentMiddlewareDescriptor[] = [
    {
      meta: { name: 'plugin-b', label: { en_US: 'Plugin B middleware' } },
      source: { kind: 'plugin', pluginName: '@xpert/plugin-b', displayName: 'Plugin B' }
    },
    {
      meta: { name: 'builtin', label: { en_US: 'Built-in middleware' } },
      source: { kind: 'builtin' }
    },
    {
      meta: { name: 'plugin-a-one', label: { en_US: 'First Plugin A middleware' } },
      source: { kind: 'plugin', pluginName: '@xpert/plugin-a', displayName: 'Plugin A' }
    },
    {
      meta: { name: 'plugin-a-two', label: { en_US: 'Second Plugin A middleware' } },
      source: { kind: 'plugin', pluginName: '@xpert/plugin-a', displayName: 'Plugin A' }
    }
  ]

  it('keeps built-in middleware first and groups plugin middleware by explicit source', () => {
    const groups = groupAgentMiddlewares(middlewares, '', localize)

    expect(groups.map((group) => group.key)).toEqual(['builtin', 'plugin:@xpert/plugin-b', 'plugin:@xpert/plugin-a'])
    expect(groups[2].middlewares.map((middleware) => middleware.meta.name)).toEqual(['plugin-a-one', 'plugin-a-two'])
  })

  it('keeps matching search results inside their plugin groups', () => {
    const groups = groupAgentMiddlewares(middlewares, 'Plugin A', localize)

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('plugin:@xpert/plugin-a')
    expect(groups[0].middlewares).toHaveLength(2)
  })
})
