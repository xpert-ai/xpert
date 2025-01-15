import { IPoint, ISize } from '@foblex/2d';
import { IHandler } from '@foblex/mediator'
import { createXpertNodes, IXpert, TXpertTeamNode } from 'apps/cloud/src/app/@core'

export class ToNodeViewModelHandler implements IHandler<void, {nodes: TXpertTeamNode[]; size: ISize}> {
  constructor(private team: IXpert, private options?: {position: IPoint}) {}

  public handle() {
    return createXpertNodes(this.team, this.options?.position ?? {x: 0, y: 0})
  }
}
