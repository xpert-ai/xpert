import { agentEventDecisionSchema, pluginAgentEventSchema } from './agent-event.schema'

const subject = { kind: 'quote', key: 'quote-1' }
const event = {
  sourceEventId: 'delivery-1',
  bindingRevision: 1,
  type: 'quote.revised',
  schemaVersion: 1,
  occurredAt: '2026-01-01T10:00:00Z',
  subject,
  fact: { key: 'fact-1', revision: 'r1', sha256: 'a'.repeat(64) }
}

describe('event source contracts', () => {
  it('accepts a complete event and requires each envelope, subject and fact field', () => {
    expect(pluginAgentEventSchema.parse(event)).toEqual(event)
    for (const key of Object.keys(event)) {
      expect(pluginAgentEventSchema.safeParse({ ...event, [key]: undefined }).success).toBe(false)
    }
    for (const field of ['subject', 'fact'] as const) {
      for (const key of Object.keys(event[field])) {
        const incomplete = { ...event, [field]: { ...event[field], [key]: undefined } }
        expect(pluginAgentEventSchema.safeParse(incomplete).success).toBe(false)
      }
    }
  })

  it.each([
    { status: 'handled', operationKey: 'operation-1', resultRef: subject },
    { status: 'ignored', reasonCode: 'baseline' },
    { status: 'blocked', reasonCode: 'binding_changed' }
  ])('requires every field for status $status', (decision) => {
    expect(agentEventDecisionSchema.parse(decision)).toEqual(decision)
    for (const key of Object.keys(decision)) {
      expect(agentEventDecisionSchema.safeParse({ ...decision, [key]: undefined }).success).toBe(false)
    }
  })
})
