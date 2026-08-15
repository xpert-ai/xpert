import {
  evolutionApprovalGatePresentation,
  evolutionScopeId,
  evolutionScopeLabel,
  evolutionSummaryPresentation,
  learningEventPresentation,
  sameEvolutionScope
} from './agent-evolution.types'
import type { ApprovalDecision } from '@xpert-ai/contracts'

describe('Agent Evolution scope helpers', () => {
  it('compares dimensions independently of object key order', () => {
    const left = {
      type: 'project' as const,
      key: 'PROJECT-001',
      dimensions: { productFamily: 'AUTO-MOTOR-001', projectId: 'PROJECT-001' }
    }
    const right = {
      type: 'project' as const,
      key: 'PROJECT-001',
      dimensions: { projectId: 'PROJECT-001', productFamily: 'AUTO-MOTOR-001' }
    }

    expect(sameEvolutionScope(left, right)).toBe(true)
    expect(evolutionScopeId(left)).toBe(evolutionScopeId(right))
    expect(evolutionScopeLabel(left)).toContain('projectId=PROJECT-001')
  })

  it('keeps different projects isolated', () => {
    expect(sameEvolutionScope({ type: 'project', key: 'PROJECT-001' }, { type: 'project', key: 'PROJECT-002' })).toBe(
      false
    )
  })
})

describe('Agent Evolution Learning Event presentation', () => {
  it('turns a structured requirement review into a semantic title and ordered fields', () => {
    const presentation = learningEventPresentation({
      predictionSummary: JSON.stringify({
        status: 'candidate',
        unit: null,
        requirementKey: 'protection_grade',
        normalizedValueType: 'string'
      }),
      finalOutcomeSummary: JSON.stringify({
        requirementKey: 'protection_grade',
        status: 'confirmed',
        normalizedValueType: 'string',
        unit: null,
        reviewMode: 'individual'
      }),
      decisionPoint: 'requirement_feature_binding_review',
      subjectRef: 'bom-case:CASE-001:requirement:REQ-001'
    })

    expect(presentation.title).toBe('protection_grade')
    expect(presentation.titleLabelKey).toBe('XP.AgentEvolution.SummaryField.requirementKey')
    expect(presentation.prediction.text).toBeNull()
    expect(presentation.prediction.fields.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'requirementKey', value: 'protection_grade' },
      { key: 'status', value: 'candidate' },
      { key: 'normalizedValueType', value: 'string' }
    ])
    expect(presentation.finalOutcome.fields.at(-1)).toMatchObject({
      key: 'reviewMode',
      valueKey: 'XP.AgentEvolution.SummaryValue.individual'
    })
  })

  it('supports PBOM and OCR scalar fields without exposing serialized JSON', () => {
    const pbom = evolutionSummaryPresentation(
      JSON.stringify({ candidateId: 'PBOM-001', rank: 1, score: 0.96, eligible: true })
    )
    const ocr = evolutionSummaryPresentation(
      JSON.stringify({ processorType: 'document-ai', recognitionProvider: 'provider-a' })
    )

    expect(pbom.text).toBeNull()
    expect(pbom.fields.map((field) => field.key)).toEqual(['candidateId', 'rank', 'score', 'eligible'])
    expect(pbom.fields.at(-1)?.valueKey).toBe('XP.AgentEvolution.SummaryValue.true')
    expect(ocr.fields.map((field) => field.key)).toEqual(['processorType', 'recognitionProvider'])
  })

  it('preserves prose summaries and hides malformed JSON-looking implementation data', () => {
    expect(evolutionSummaryPresentation('attribute_unmapped')).toEqual({ text: 'attribute_unmapped', fields: [] })
    expect(evolutionSummaryPresentation('{"requirementKey":')).toEqual({ text: null, fields: [] })
  })
})

describe('Agent Evolution approval gate presentation', () => {
  it('shows the single-approver path to administrators without treating an older standard approval as sufficient', () => {
    const existingApproval = approval({ actorId: 'admin-1', actorRole: 'admin-role' })

    expect(evolutionApprovalGatePresentation('R2', [existingApproval], 'SUPER_ADMIN')).toMatchObject({
      administratorPath: true,
      hasAdministratorApproval: false,
      requiredApprovals: 1,
      progress: 0,
      passed: false
    })
  })

  it('satisfies every risk level with one frozen administrator approval', () => {
    expect(
      evolutionApprovalGatePresentation(
        'R4',
        [approval({ approvalAuthority: 'administrator', actorRoleName: 'ADMIN' })],
        'ADMIN'
      )
    ).toMatchObject({ requiredApprovals: 1, progress: 1, passed: true })
  })

  it('keeps distinct users and roles for standard approvals', () => {
    const approvals = [
      approval({ actorId: 'user-1', actorRole: 'role-1' }),
      approval({ actorId: 'user-2', actorRole: 'role-2' })
    ]

    expect(evolutionApprovalGatePresentation('R2', approvals, 'AI_BUILDER')).toMatchObject({
      administratorPath: false,
      requiredApprovals: 2,
      progress: 2,
      passed: true
    })
  })
})

function approval(overrides: Partial<ApprovalDecision>): ApprovalDecision {
  return {
    approvalId: `APR-${overrides.actorId ?? 'user'}`,
    candidateId: 'CAND-001',
    candidateHash: 'sha256:candidate',
    evaluationRunId: 'ER-001',
    scope: { type: 'organization', key: 'ORG-001' },
    decision: 'approved',
    actorId: 'user-1',
    actorRole: 'role-1',
    reason: 'Approved for test',
    decidedAt: '2026-08-15T00:00:00.000Z',
    ...overrides
  }
}
