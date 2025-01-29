import { IRect, IWorkflowNode } from 'apps/cloud/src/app/@core';

export class CreateWorkflowNodeRequest {
  constructor(
    public readonly position: IRect,
    public readonly entity?: Partial<IWorkflowNode>
  ) {}
}
