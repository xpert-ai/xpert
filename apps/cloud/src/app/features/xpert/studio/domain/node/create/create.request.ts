import { IRect, TXpertTeamNode, TXpertTeamNodeType } from 'apps/cloud/src/app/@core';

export class CreateNodeRequest {
  constructor(
    public readonly type: TXpertTeamNodeType,
    public readonly position: IRect,
    public readonly entity?: Partial<TXpertTeamNode['entity']>
  ) {}
}
