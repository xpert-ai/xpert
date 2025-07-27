import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { TXpertGraph } from 'apps/cloud/src/app/@core'
import { IStudioStore } from '../types'
import { layoutGraphWithMixedDirection } from './layout'
import { LayoutRequest } from './layout.request'

export class LayoutHandler implements IHandler<LayoutRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  async handle(request: LayoutRequest) {
    const draft: TXpertGraph = await layoutGraphWithMixedDirection(structuredClone(this.store.getValue().draft))
    this.store.update((state) => {
      return {
        draft: {
          ...state.draft,
          nodes: state.draft.nodes.map((n) => {
            const updatedNode = draft.nodes.find((m) => m.key === n.key)
            return updatedNode ? { ...n, position: updatedNode.position } : n
          })
        }
      }
    })
  }
}
