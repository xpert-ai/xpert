import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { IStudioStore } from '../../types'
import { UpdateWorkflowNodeRequest } from './update.request'
import { TXpertTeamNode } from 'apps/cloud/src/app/@core/types'

export class UpdateWorkflowNodeHandler implements IHandler<UpdateWorkflowNodeRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: UpdateWorkflowNodeRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)

      const index = draft.nodes.findIndex((item) => item.type === 'workflow' && item.key === request.key)

      if (index === -1) {
        throw new Error(`Workflow node with key ${request.key} not found`)
      }

      draft.nodes[index] = {
        ...draft.nodes[index],
       ...request.node
      } as TXpertTeamNode

      return {
        draft
      }
    })
  }
}
