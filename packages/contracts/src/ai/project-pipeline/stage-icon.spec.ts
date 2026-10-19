import { projectPipelineStageSchema } from './primitives.schema'

it('preserves configured icons and accepts existing stages without an icon', () => {
  const stage = { key: 'review', label: 'Review', order: 0 }
  expect(projectPipelineStageSchema.parse(stage)).toEqual(stage)
  expect(projectPipelineStageSchema.parse({ ...stage, icon: 'git-pull-request' }).icon).toBe('git-pull-request')
  for (const icon of ['https://example.com/icon.svg', '<svg/>', 'unknown-icon']) {
    expect(projectPipelineStageSchema.safeParse({ ...stage, icon }).success).toBe(false)
  }
})
