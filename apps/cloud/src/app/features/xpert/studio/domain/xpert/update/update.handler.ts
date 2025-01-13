import { IHandler } from '@foblex/mediator'
import { TXpertTeamNode } from '@metad/contracts'
import { Store, StoreDef } from '@ngneat/elf'
import { ToConnectionViewModelHandler } from '../../connection'
import { ToNodeViewModelHandler } from '../../node'
import { IStudioStore } from '../../types'
import { UpdateXpertRequest } from './update.request'

export class UpdateXpertHandler implements IHandler<UpdateXpertRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: UpdateXpertRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)

      const index = draft.nodes.findIndex((_) => _.type === 'xpert' && _.key === request.xpert.id)
      if (index > -1) {
        const { nodes, size } = new ToNodeViewModelHandler(request.xpert, {
          position: draft.nodes[index].position
        }).handle()

        draft.nodes[index] = {
          ...draft.nodes[index],
          entity: request.xpert,
          size,
          nodes,
          connections: new ToConnectionViewModelHandler(request.xpert).handle(),
          expanded: true
        } as TXpertTeamNode
      }

      return {
        draft
      }
    })
  }
}
