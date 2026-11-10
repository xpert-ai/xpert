import { agentInvocationStatusSchema, agentRuntimeProgressSchema } from './agent-runtime.model'
import {
  projectTaskDecisionInputSchema,
  projectTaskDispatchToolInputSchema,
  projectTaskReviewReportSchema,
  projectTaskDispatchReceiptSchema,
  projectTaskEvidenceReferenceSchema,
  projectTaskExecutionContextSchema,
  projectTaskSpecificationSchema,
  projectTaskExecutionPurposeSchema,
  projectTaskCandidatePathSchema,
  projectTaskEvidencePathSchema
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
  const subject = {
    type: 'review', implementationExecutionId: id(5), implementationInvocationId: id(6),
    specificationDigest: context.specification.digest,
    evidence: [{ type: 'invocation_result', invocationId: id(6), revision: 2 }]
  }
  it('supports evidence-only reviews and requires a safe explicit execution candidate', () => {
    expect(projectTaskExecutionPurposeSchema.parse(subject)).toEqual(subject)
    expect(projectTaskExecutionPurposeSchema.parse({ ...subject, mode: 'execution', candidatePaths: ['plugin'] }))
      .toHaveProperty('mode', 'execution')
    for (const patch of [
      { mode: 'execution' }, { candidatePaths: ['plugin'] },
      { mode: 'execution', candidatePaths: ['../plugin'] },
      { mode: 'execution', candidatePaths: ['plugin', 'plugin'] }
    ]) expect(projectTaskExecutionPurposeSchema.safeParse({ ...subject, ...patch }).success).toBe(false)
  })

  it('applies the same review candidate rules to Agent tool input', () => {
    const input = { taskId: id(1), expectedRevision: 1, bindingId: id(2) }
    expect(projectTaskDispatchToolInputSchema.safeParse({ ...input, purpose: subject }).success).toBe(true)
    expect(projectTaskDispatchToolInputSchema.safeParse({ ...input,
      purpose: { ...subject, mode: 'execution', candidatePaths: ['plugin'] } }).success).toBe(true)
    for (const patch of [
      { mode: 'execution' }, { candidatePaths: ['plugin'] },
      { mode: 'evidence_only', candidatePaths: ['plugin'] },
      { mode: 'execution', candidatePaths: ['plugin', 'plugin'] },
      ...['/plugin', 'C:/plugin', '../plugin', 'plugin/../secret',
        'plugin//a', 'plugin\\a', 'plugin\nlog'].map((path) => ({ mode: 'execution', candidatePaths: [path] }))
    ]) expect(projectTaskDispatchToolInputSchema.safeParse({ ...input, purpose: { ...subject, ...patch } }).success).toBe(false)
  })

  it('leaves candidate exclusions to the runtime and permits build and coverage report paths', () => {
    for (const path of ['plugin/dist/index.js', 'coverage/report.json', '.cache/check.log', 'plugin/node_modules/pkg', 'plugin/.git/config']) {
      expect(projectTaskCandidatePathSchema.safeParse(path).success).toBe(true)
      expect(projectTaskEvidencePathSchema.safeParse(path).success).toBe(true)
    }
    for (const path of ['/tmp/report.json', 'C:/report.json', '../secret', 'output/../secret', 'output//report', 'output\\report', 'output\nreport']) {
      expect(projectTaskCandidatePathSchema.safeParse(path).success).toBe(false)
      expect(projectTaskEvidencePathSchema.safeParse(path).success).toBe(false)
    }
    expect(projectTaskReviewReportSchema.safeParse({ version: 2, mode: 'execution', verdict: 'pass',
      specificationDigest: subject.specificationDigest, implementationInvocationId: subject.implementationInvocationId,
      evidence: subject.evidence, summary: 'Build and coverage checked', findings: [], limitations: [],
      checks: [{ description: 'Build', outcome: 'passed', actual: 'Build succeeds',
        evidencePaths: ['output/work/dist/build.log', 'output/coverage/report.json'] }] }).success).toBe(true)
  })

  it('pins reviewer and feedback references without accepting caller identity or arbitrary policy overrides', () => {
    const purpose = { type: 'implementation', reviewer: { bindingId: id(8), mode: 'execution' },
      rework: { reviewExecutionId: id(9), findingIds: ['F-01'] } }
    expect(projectTaskExecutionPurposeSchema.parse(purpose)).toEqual(purpose)
    expect(projectTaskExecutionPurposeSchema.safeParse({ ...purpose, reviewer: { ...purpose.reviewer, userId: id(1) } }).success).toBe(false)
    expect(projectTaskExecutionPurposeSchema.safeParse({ ...purpose, rework: { reviewExecutionId: id(9), findingIds: [] } }).success).toBe(false)
  })

  it('keeps execution feedback actionable and rejects conflicting verdicts and duplicate finding identities', () => {
    const finding = { id: 'F-01', kind: 'environment', blocking: true, description: 'Test service unavailable',
      reproduction: 'Call the selected development API', expected: 'Service responds', actual: 'Connection refused' }
    const report = { version: 2, mode: 'execution', verdict: 'indeterminate',
      specificationDigest: subject.specificationDigest, implementationInvocationId: subject.implementationInvocationId,
      evidence: subject.evidence, summary: 'Could not verify the feature',
      checks: [{ description: 'Live call', outcome: 'blocked', actual: 'Connection refused' }],
      findings: [finding], limitations: ['No feature behavior observed'] }
    expect(projectTaskReviewReportSchema.parse(report)).toEqual(report)
    expect(projectTaskReviewReportSchema.safeParse({ ...report, verdict: 'pass' }).success).toBe(false)
    expect(projectTaskReviewReportSchema.safeParse({ ...report, findings: [finding, finding] }).success).toBe(false)
  })
  it('requires evidence and performed checks, and rejects model-supplied decision identity', () => {
    const decision = {
      requestId: id(1),
      taskId: id(2),
      expectedRevision: 1,
      implementationExecutionId: id(3),
      specificationDigest: context.specification.digest,
      evidence: [{ type: 'invocation_result', invocationId: id(4), revision: 2 }],
      outcome: 'accept',
      rationale: 'Checked the current implementation',
      checks: ['Inspected tests']
    }
    expect(projectTaskDecisionInputSchema.parse(decision)).toEqual(decision)
    for (const extra of [
      { actorId: id(9) },
      { actorType: 'user' },
      { taskRevision: 99 },
      { evidence: [] },
      { checks: [] }
    ])
      expect(projectTaskDecisionInputSchema.safeParse({ ...decision, ...extra }).success).toBe(false)
  })

  it('accepts only structured review verdicts with pinned evidence and explicit limitations', () => {
    const report = {
      version: 1,
      verdict: 'pass',
      specificationDigest: context.specification.digest,
      implementationInvocationId: id(4),
      evidence: [{ type: 'invocation_result', invocationId: id(4), revision: 2 }],
      findings: ['The supplied tests cover the stated requirements'],
      limitations: ['Tests were not independently executed']
    }
    expect(projectTaskReviewReportSchema.parse(report)).toEqual(report)
    expect(projectTaskReviewReportSchema.safeParse('All tests passed').success).toBe(false)
    for (const extra of [
      { verdict: 'done' },
      { findings: [] },
      { evidence: [] },
      { limitations: undefined },
      { acceptTask: true }
    ])
      expect(projectTaskReviewReportSchema.safeParse({ ...report, ...extra }).success).toBe(false)
  })

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

it('exposes review subtask choice without asking the model for host-owned associations', () => {
  const input = { taskId: id(1), expectedRevision: 1, bindingId: id(2), reviewAsSubtask: true,
    purpose: { type: 'review', mode: 'execution', candidatePaths: ['plugin'], implementationExecutionId: id(3),
      implementationInvocationId: id(4), specificationDigest: `sha256:${'a'.repeat(64)}`,
      evidence: [{ type: 'invocation_result', invocationId: id(4), revision: 1 }] } }
  expect(projectTaskDispatchToolInputSchema.safeParse(input).success).toBe(true)
  expect(projectTaskDispatchToolInputSchema.safeParse({ ...input,
    purpose: { ...input.purpose, implementationTaskId: id(5) } }).success).toBe(false)
})
it('keeps summary requirement identity host-owned during implementation dispatch', () => {
  const input = { taskId: id(1), expectedRevision: 1, bindingId: id(2),
    purpose: { type: 'implementation', coordination: { taskId: id(3), specificationDigest: `sha256:${'a'.repeat(64)}` } } }
  expect(projectTaskDispatchToolInputSchema.safeParse(input).success).toBe(false)
})
