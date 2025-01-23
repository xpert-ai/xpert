import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { omit } from 'lodash-es'
import { calculateHash, IStudioStore } from '../../types'
import { ReplaceNodeRequest } from './replace.request'

export class ReplaceNodeHandler implements IHandler<ReplaceNodeRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: ReplaceNodeRequest): void {
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

      // Replace connections
      draft.connections.forEach((conn) => {
        if (conn.to === request.key) {
          conn.to = request.node.key
          conn.key = `${conn.from}/${conn.to}`
        }
      })

      draft.nodes[index].hash = calculateHash(JSON.stringify(omit(draft.nodes[index], 'hash')))

      return {
        draft
      }
    })
  }
}
