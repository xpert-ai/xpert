jest.mock('@xpert-ai/plugin-sdk', () => ({
  RequestContext: {
    currentUser: jest.fn(() => ({ id: 'user-1' }))
  }
}))

jest.mock('../../../skill-package', () => ({
  SkillPackageService: class SkillPackageService {}
}))

import { ListWorkspaceSkillsQuery } from '../list-workspace-skills.query'
import { ListWorkspaceSkillsHandler } from './list-workspace-skills.handler'

describe('ListWorkspaceSkillsHandler', () => {
  it('returns installed skills from the requested workspace', async () => {
    const skillPackageService = {
      getAllByWorkspace: jest.fn().mockResolvedValue({
        items: [{ id: 'skill-1' }, { id: 'skill-2' }]
      })
    }

    const handler = new ListWorkspaceSkillsHandler(skillPackageService as any)

    await expect(handler.execute(new ListWorkspaceSkillsQuery('workspace-1'))).resolves.toEqual([
      { id: 'skill-1' },
      { id: 'skill-2' }
    ])
    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledWith(
      'workspace-1',
      {
        relations: ['skillIndex', 'skillIndex.repository']
      },
      false,
      { id: 'user-1' }
    )
  })
})
