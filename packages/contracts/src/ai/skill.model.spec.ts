import { createRuntimeSkillCapabilityId, parseRuntimeSkillCapabilityId } from './skill.model'

describe('runtime skill capability identity', () => {
  it('keeps same-name Xpert and Project skills distinct and reversible', () => {
    const xpertId = createRuntimeSkillCapabilityId({
      type: 'xpert',
      ownerId: 'xpert-1',
      skillId: 'office/docx-editor'
    })
    const projectId = createRuntimeSkillCapabilityId({
      type: 'project',
      ownerId: 'project-1',
      skillId: 'office/docx-editor'
    })

    expect(xpertId).not.toBe(projectId)
    expect(parseRuntimeSkillCapabilityId(xpertId)).toEqual({
      type: 'xpert',
      ownerId: 'xpert-1',
      skillId: 'office/docx-editor'
    })
    expect(parseRuntimeSkillCapabilityId(projectId)).toEqual({
      type: 'project',
      ownerId: 'project-1',
      skillId: 'office/docx-editor'
    })
  })

  it('rejects malformed identities', () => {
    expect(parseRuntimeSkillCapabilityId('runtime-skill/v1/project/project-1')).toBeNull()
    expect(parseRuntimeSkillCapabilityId('runtime-skill/v2/project/project-1/xlsx')).toBeNull()
  })
})
