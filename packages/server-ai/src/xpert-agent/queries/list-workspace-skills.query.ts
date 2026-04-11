import { ISkillPackage } from '@xpert-ai/contracts'
import { Query } from '@nestjs/cqrs'

export class ListWorkspaceSkillsQuery extends Query<ISkillPackage[]> {
  static readonly type = '[Xpert Agent] List workspace skills'

  constructor(public readonly workspaceId: string) {
    super()
  }
}
