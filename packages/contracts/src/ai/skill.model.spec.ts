import { ISkillPackage } from './skill.model'

describe('ISkillPackage', () => {
  it('exposes publishAt on shared skill packages', () => {
    const publishAt = new Date('2026-04-09T12:00:00.000Z')
    const skillPackage: ISkillPackage = {
      visibility: 'private',
      metadata: {
        name: 'weather',
        version: '1.0.0',
        visibility: 'private'
      },
      instructions: {},
      publishAt
    }

    expect(skillPackage.publishAt).toBe(publishAt)
  })
})
