import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { IStudioStore } from '../../types'
import { RemoveConnectionRequest } from './remove.request'
import { removeConnSuffix } from '../types'

export class RemoveConnectionHandler implements IHandler<RemoveConnectionRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: RemoveConnectionRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      const sourceId = removeConnSuffix(request.sourceId)
      const targetId = removeConnSuffix(request.targetId)
        draft.connections = draft.connections.filter((item) => !(item.from === sourceId && item.to === targetId))
      return {
        draft
      }
    })
  }
}
