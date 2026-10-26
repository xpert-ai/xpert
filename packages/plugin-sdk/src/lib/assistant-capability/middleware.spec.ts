import { applyAssistantMiddleware, hasAssistantMiddleware } from './middleware'
import type { TXpertTeamDraft } from '@xpert-ai/contracts'
const draft = (): TXpertTeamDraft => ({
  team: { agent: { key: 'main' } },
  nodes: [
    {
      type: 'agent',
      key: 'main',
      position: { x: 0, y: 0 },
      entity: { key: 'main', prompt: 'Keep.', options: { middlewares: { order: ['existing'] } } }
    }
  ],
  connections: []
})
const input = {
  provider: 'NativeProvider',
  key: 'Capability_Native',
  title: 'Native',
  instructions: 'Use the native write protocol.'
}
it('composes once and preserves an existing capability configuration', () => {
  const value = draft()
  applyAssistantMiddleware(value, input)
  expect(hasAssistantMiddleware(value, input.provider)).toBe(true)
  value.connections[0].to += '/input'
  const snapshot = structuredClone(value)
  applyAssistantMiddleware(value, input)
  expect(value).toEqual(snapshot)
  expect(value.nodes[0].entity.options.middlewares.order).toEqual(['existing', input.key])
})
it('does not overwrite disconnected or secondary Agent nodes', () => {
  const value = draft()
  applyAssistantMiddleware(value, input)
  value.connections[0].from = 'secondary'
  const original = structuredClone(value.nodes[1])
  applyAssistantMiddleware(value, input)
  expect(value.nodes[1]).toEqual(original)
  expect(value.nodes[2].key).toBe('Capability_Native_2')
})
