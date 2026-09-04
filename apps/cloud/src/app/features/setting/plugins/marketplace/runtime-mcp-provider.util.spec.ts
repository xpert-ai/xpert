import { PLUGIN_COMPONENT_TYPE } from '@cloud/app/@core/state'
import {
  isRuntimeNativeMcp,
  runtimeMcpProviderDescription,
  runtimeMcpProviderKey,
  runtimeMcpProviderName,
  runtimeMcpProviderToolCount
} from './runtime-mcp-provider.util'

describe('runtime MCP Provider utilities', () => {
  const component = {
    componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
    componentKey: 'factory-insights',
    definitionHash: 'hash',
    metadata: { runtimeDiscovered: true, nativeMcp: true },
    config: {
      provider: 'factory_ops_insights',
      name: 'Factory Operations Insights',
      description: 'Read-only operational insights.',
      toolCount: 5
    }
  }

  it('recognizes and presents a runtime-discovered native MCP Provider', () => {
    expect(isRuntimeNativeMcp(component)).toBe(true)
    expect(runtimeMcpProviderName(component)).toBe('Factory Operations Insights')
    expect(runtimeMcpProviderDescription(component)).toBe('Read-only operational insights.')
    expect(runtimeMcpProviderKey(component)).toBe('factory_ops_insights')
    expect(runtimeMcpProviderToolCount(component)).toBe(5)
  })

  it('rejects manifest-only or non-native Toolsets', () => {
    expect(isRuntimeNativeMcp({ metadata: { runtimeDiscovered: false, nativeMcp: true } })).toBe(false)
    expect(isRuntimeNativeMcp({ metadata: { runtimeDiscovered: true, nativeMcp: false } })).toBe(false)
  })
})
