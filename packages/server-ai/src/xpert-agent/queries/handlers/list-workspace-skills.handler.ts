import { ISkillPackage } from '@xpert-ai/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SkillPackageService } from '../../../skill-package'
import { ListWorkspaceSkillsQuery } from '../list-workspace-skills.query'

@QueryHandler(ListWorkspaceSkillsQuery)
export class ListWorkspaceSkillsHandler implements IQueryHandler<ListWorkspaceSkillsQuery> {
  constructor(private readonly skillPackageService: SkillPackageService) {}

  async execute(query: ListWorkspaceSkillsQuery): Promise<ISkillPackage[]> {
    const result = await this.skillPackageService.getAllByWorkspace(
      query.workspaceId,
      {
        relations: ['skillIndex', 'skillIndex.repository']
      } as any,
      false,
      RequestContext.currentUser()
    )

    return result.items ?? []
  }
}
