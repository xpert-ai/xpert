import { agentInvocationStatusSchema, agentRuntimeProgressSchema } from './agent-runtime.model'
import {
  projectTaskDispatchReceiptSchema,
  projectTaskEvidenceReferenceSchema,
  projectTaskExecutionContextSchema,
  projectTaskSpecificationSchema
} from './project-task-runtime.model'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const specification = {
  version: 1 as const,
  title: 'Generate a report',
  requirements: ['Include sources'],
  steps: []
}
const context = {
  projectId: id(1),
  projectTaskId: id(2),
  taskExecutionId: id(3),
  specification: { digest: `sha256:${'a'.repeat(64)}`, specification },
  purpose: { type: 'implementation' as const }
}

describe('project task runtime contracts', () => {
  it('keeps business task, attempt and invocation identities separate without imposing a coding domain', () => {
    expect(projectTaskExecutionContextSchema.parse(context)).toEqual(context)
    const receipt = {
      projectId: id(1),
      projectTaskId: id(2),
      taskExecutionId: id(3),
      invocationId: id(4),
      status: 'unknown'
    }
    expect(projectTaskDispatchReceiptSchema.parse(receipt)).toEqual(receipt)
    expect(projectTaskDispatchReceiptSchema.safeParse({ ...receipt, status: 'done' }).success).toBe(false)
    expect(projectTaskDispatchReceiptSchema.safeParse({ ...receipt, agentExecutionId: id(4) }).success).toBe(false)
  })

  it('requires an explicit review purpose with a different implementation attempt and matching specification', () => {
    const review = {
      ...context,
      purpose: {
        type: 'review',
        implementationExecutionId: id(5),
        implementationInvocationId: id(6),
        specificationDigest: context.specification.digest,
        evidence: [{ type: 'artifact', artifactId: id(7), versionId: id(8) }]
      }
    }
    expect(projectTaskExecutionContextSchema.parse(review)).toEqual(review)
    for (const patch of [
      { implementationExecutionId: context.taskExecutionId },
      { specificationDigest: `sha256:${'b'.repeat(64)}` },
      { evidence: [] },
      { completeTask: true }
    ]) {
      expect(
        projectTaskExecutionContextSchema.safeParse({
          ...review,
          purpose: { ...review.purpose, ...patch }
        }).success
      ).toBe(false)
    }
    expect(projectTaskExecutionContextSchema.safeParse({ ...context, purpose: undefined }).success).toBe(false)
  })

  it('rejects unversioned artifacts, raw paths and identity claims', () => {
    for (const evidence of [
      { type: 'artifact', artifactId: id(7) },
      { type: 'workspace_snapshot', path: '/workspace/report.pdf' },
      { type: 'invocation_result', invocationId: id(4), revision: -1 }
    ])
      expect(projectTaskEvidenceReferenceSchema.safeParse(evidence).success).toBe(false)
    expect(projectTaskExecutionContextSchema.safeParse({ ...context, tenantId: id(9) }).success).toBe(false)
  })

  it('keeps progress and concurrency revision out of the specification and rejects duplicate step indices', () => {
    for (const extra of [{ status: 'done' }, { revision: 2 }, { progress: 90 }, { assigneeXpertId: id(4) }]) {
      expect(projectTaskSpecificationSchema.safeParse({ ...specification, ...extra }).success).toBe(false)
    }
    expect(
      projectTaskSpecificationSchema.safeParse({
        ...specification,
        steps: [
          { stepIndex: 1, description: 'First' },
          { stepIndex: 1, description: 'Second' }
        ]
      }).success
    ).toBe(false)
    expect(projectTaskSpecificationSchema.safeParse({ ...specification, requirements: [] }).success).toBe(false)
  })

  it('records observation provenance without treating a heartbeat or a percentage as completion', () => {
    const heartbeat = { source: 'host', observedAt: '2026-10-06T01:00:00Z' }
    expect(agentRuntimeProgressSchema.parse(heartbeat)).toEqual(heartbeat)
    expect(
      agentRuntimeProgressSchema.parse({ ...heartbeat, phase: 'Checking', steps: { completed: 3, total: 5 } })
    ).toHaveProperty('steps.completed', 3)
    for (const patch of [
      { steps: { completed: 3, total: 2 } },
      { steps: { completed: 0, total: 0 } },
      { percentage: 100 },
      { source: 'user' },
      { observedAt: 'yesterday' },
      { status: 'done' }
    ])
      expect(agentRuntimeProgressSchema.safeParse({ ...heartbeat, ...patch }).success).toBe(false)
    expect(agentInvocationStatusSchema.safeParse('received').success).toBe(false)
  })
})
