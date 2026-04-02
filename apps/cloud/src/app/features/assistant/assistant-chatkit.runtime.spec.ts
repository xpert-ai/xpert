import {
  AssistantBindingScope,
  AssistantBindingSourceScope,
  AssistantCode,
  type IResolvedAssistantBinding
} from '../../@core'
import {
  hasAssistantBindingSource,
  hasCompleteAssistantBinding
} from './assistant-chatkit.runtime'

function createResolvedBinding(
  overrides: Partial<IResolvedAssistantBinding> = {}
): IResolvedAssistantBinding {
  return {
    id: 'binding-1',
    code: AssistantCode.CHATBI,
    scope: AssistantBindingScope.ORGANIZATION,
    assistantId: 'assistant-1',
    enabled: true,
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: null,
    sourceScope: AssistantBindingSourceScope.ORGANIZATION,
    ...overrides
  }
}

describe('assistant chatkit runtime helpers', () => {
  it('treats non-none source bindings as available', () => {
    expect(hasAssistantBindingSource(createResolvedBinding())).toBe(true)
    expect(
      hasAssistantBindingSource(createResolvedBinding({ sourceScope: AssistantBindingSourceScope.NONE }))
    ).toBe(false)
    expect(hasAssistantBindingSource(null)).toBe(false)
  })

  it('uses the resolved binding assistantId with the hosted frame url', () => {
    expect(hasCompleteAssistantBinding(createResolvedBinding(), 'https://chatkit.example.com')).toBe(true)
    expect(
      hasCompleteAssistantBinding(createResolvedBinding({ assistantId: null }), 'https://chatkit.example.com')
    ).toBe(false)
    expect(hasCompleteAssistantBinding(createResolvedBinding(), null)).toBe(false)
  })
})
