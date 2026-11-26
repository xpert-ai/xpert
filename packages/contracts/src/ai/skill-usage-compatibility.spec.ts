import { isLegacySkillUsageComponent } from './skill-usage-compatibility'

const skill = {
  type: 'component',
  data: {
    category: 'Computer',
    tool: 'read_skill_file',
    status: 'success',
    taskSummary: {
      version: 1,
      skillUsages: [
        {
          skillId: 'skill',
          name: 'Skill',
          version: '1',
          source: { type: 'plugin', id: 'plugin' },
          activation: 'read',
          toolCallId: 'call',
          loadedAt: '2026-11-26T00:00:00Z'
        }
      ]
    }
  }
}

describe('legacy skill metadata compatibility', () => {
  it('recognizes only validated skill-only metadata, leaving normal tool activity visible', () => {
    expect(isLegacySkillUsageComponent(skill)).toBe(true)
    expect(isLegacySkillUsageComponent({ ...skill, data: { ...skill.data, category: 'Tool' } })).toBe(false)
    expect(isLegacySkillUsageComponent(null)).toBe(false)
  })
  it.each([
    { output: 'content' },
    { error: 'failure' },
    { artifact: {} },
    { type: 'Widget', widgets: [] },
    { status: 'fail' },
    { taskSummary: { version: 1, skillUsages: [] } }
  ])('preserves actual results or unverified records: %j', (fields) => {
    expect(isLegacySkillUsageComponent({ ...skill, data: { ...skill.data, ...fields } })).toBe(false)
  })
})
