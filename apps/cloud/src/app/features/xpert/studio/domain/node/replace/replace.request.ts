import { TXpertTeamNode } from 'apps/cloud/src/app/@core';

export class ReplaceNodeRequest {
  constructor(
    public readonly key: string,
    public readonly node: Partial<TXpertTeamNode>
  ) {}
}
