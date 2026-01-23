import { TXpertTeamNode } from 'apps/cloud/src/app/@core';

/**
 * @deprecated
 */
export class UpdateNodeRequest {
  constructor(
    public readonly key: string,
    public readonly node: Partial<TXpertTeamNode>
  ) {}
}
