import { projectPipelineNodePresentationSchema } from './projection.schema'
it('accepts bounded display facts without embedding executable domain commands', () => {
  expect(
    projectPipelineNodePresentationSchema.parse({
      description: 'Review current change',
      blockers: ['Approval pending'],
      nextActionable: true,
      roleDetails: [{ label: 'Role', value: 'Reviewer' }],
      decision: {
        outcome: 'review',
        label: '人工复核',
        reason: 'Policy match',
        decidedAt: '2026-10-19T08:00:00Z',
        version: 'revision-2'
      }
    }).decision?.outcome
  ).toBe('review')
  for (const invalid of [
    { url: 'https://example.test' },
    { nextActionable: 'true' },
    { blockers: ['a'.repeat(1001)] },
    { roleDetails: [{ label: 'role', value: 'Reviewer', action: 'run' }] }
  ])
    expect(projectPipelineNodePresentationSchema.safeParse(invalid).success).toBe(false)
})
