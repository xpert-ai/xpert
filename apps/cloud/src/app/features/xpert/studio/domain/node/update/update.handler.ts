import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { omit } from 'lodash-es'
import { calculateHash, IStudioStore } from '../../types'
import { UpdateNodeRequest } from './update.request'

export class UpdateNodeHandler implements IHandler<UpdateNodeRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: UpdateNodeRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      const index = draft.nodes.findIndex((_) => _.key === request.key)
      if (index > -1) {
        draft.nodes[index] = {
          ...draft.nodes[index],
          ...request.node
        } as TXpertTeamNode
      } else {
        throw new Error(`Node with key ${request.key} not found!`)
      }

      draft.nodes[index].hash = calculateHash(JSON.stringify(omit(draft.nodes[index], 'hash')))

      return {
        draft
      }
    })
  }
}
