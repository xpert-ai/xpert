import { IRect, IWorkflowNode, TXpertTeamNode } from 'apps/cloud/src/app/@core';

export class CreateWorkflowNodeRequest {
  constructor(
    public readonly position: IRect,
    public readonly entity?: Partial<IWorkflowNode>,
    public readonly node?: Partial<TXpertTeamNode>
  ) {}
}
