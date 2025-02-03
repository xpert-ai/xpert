import { TXpertTeamNode } from 'apps/cloud/src/app/@core'

export class UpdateWorkflowNodeRequest {
  constructor(
    public readonly key: string,
    public readonly node: Partial<TXpertTeamNode>
  ) {}
}
