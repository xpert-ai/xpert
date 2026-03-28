import { ISkillPackage } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ListWorkspaceSkillsQuery } from '../list-workspace-skills.query'

@QueryHandler(ListWorkspaceSkillsQuery)
export class ListWorkspaceSkillsHandler implements IQueryHandler<ListWorkspaceSkillsQuery> {
  async execute(_query: ListWorkspaceSkillsQuery): Promise<ISkillPackage[]> {
    return []
  }
}
