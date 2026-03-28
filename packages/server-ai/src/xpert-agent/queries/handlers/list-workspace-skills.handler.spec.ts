import { ListWorkspaceSkillsQuery } from '../list-workspace-skills.query'
import { ListWorkspaceSkillsHandler } from './list-workspace-skills.handler'

describe('ListWorkspaceSkillsHandler', () => {
  it('returns an empty list placeholder for now', async () => {
    const handler = new ListWorkspaceSkillsHandler()

    await expect(handler.execute(new ListWorkspaceSkillsQuery('workspace-1'))).resolves.toEqual([])
  })
})
