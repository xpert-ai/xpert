import {
  agentEventDecisionSchema,
  agentEventRefSchema,
  pluginAgentEventSchema,
  type AgentEventRef,
  type EventDecision,
  type PluginAgentEvent
} from '@xpert-ai/plugin-sdk'

const ref = { kind: 'quote', key: 'quote-1' } satisfies AgentEventRef
const event = {
  sourceEventId: 'delivery-1',
  bindingRevision: 1,
  type: 'quote.revised',
  schemaVersion: 1,
  occurredAt: '2026-01-01T10:00:00Z',
  subject: ref,
  fact: { key: 'fact-1', revision: 'r1', sha256: 'a'.repeat(64) }
} satisfies PluginAgentEvent

// Both the SDK types and the public schema outputs must be assignable to a complete event.
declare const delivered: PluginAgentEvent
const complete: typeof event = delivered
const parsedEvent: typeof event = pluginAgentEventSchema.parse(event)
const parsedRef: typeof ref = agentEventRefSchema.parse(ref)

function checkDecision(decision: EventDecision) {
  if (decision.status === 'handled') {
    const operation: string = decision.operationKey
    const result: typeof ref = decision.resultRef
  } else {
    const status: 'blocked' | 'ignored' = decision.status
    const reason: string = decision.reasonCode
  }
}
checkDecision(agentEventDecisionSchema.parse({ status: 'handled', operationKey: 'operation-1', resultRef: ref }))
checkDecision({ status: 'ignored', reasonCode: 'baseline' })
checkDecision({ status: 'blocked', reasonCode: 'binding_changed' })

// @ts-expect-error Event metadata, subject and fact are required.
const emptyEvent: PluginAgentEvent = {}
// @ts-expect-error A fact reference needs its revision.
const missingRevision: PluginAgentEvent = { ...event, fact: { key: 'fact-1', sha256: 'a'.repeat(64) } }
// @ts-expect-error Every handled decision identifies its operation and result.
checkDecision({ status: 'handled' })
// @ts-expect-error A result reference needs both kind and key.
checkDecision({ status: 'handled', operationKey: 'operation-1', resultRef: { kind: 'review' } })
// @ts-expect-error An ignored decision must carry a reason.
checkDecision({ status: 'ignored' })
// @ts-expect-error A blocked decision must carry a reason.
checkDecision({ status: 'blocked' })
