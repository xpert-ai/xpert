import { randomUUID } from 'node:crypto'
import { executionControlEvidenceSchema } from './execution-control-evidence.schema'

it.each(['result_delivery_blocked', 'result_delivery_failed', 'result_delivery_unconfirmed'] as const)(
  'retains the platform attempt identity while reporting %s',
  (reason) => {
    const evidence = {
      version: 1,
      source: 'platform',
      subject: { kind: 'execution', id: randomUUID() },
      scope: 'owned_subtree',
      state: 'unknown',
      reason,
      desired: 'running',
      taskId: randomUUID(),
      rootId: randomUUID(),
      revision: 2,
      executionId: randomUUID(),
      threadId: 'thread',
      observedAt: new Date().toISOString()
    }
    expect(executionControlEvidenceSchema.parse(evidence)).toEqual(evidence)
    expect(executionControlEvidenceSchema.safeParse({ ...evidence, reason: 'arbitrary-diagnostic' }).success).toBe(
      false
    )
    const { reason: _reason, ...legacy } = evidence
    expect(executionControlEvidenceSchema.safeParse({ ...legacy, state: 'settled' }).success).toBe(true)
  }
)
