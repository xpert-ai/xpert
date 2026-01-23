import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { IStudioStore } from '../../types'
import { CreateWorkflowNodeRequest } from './create.request'

export class CreateWorkflowNodeHandler implements IHandler<CreateWorkflowNodeRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: CreateWorkflowNodeRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)

      if (request.entity) {
        if (draft.nodes.find((item) => item.type === 'workflow' && item.entity?.key === request.entity.key)) {
          throw new Error(`Node with key ${request.entity.key} already added!`)
        }
      }

      const node = {
        ...(request.node ?? {}),
        type: 'workflow',
        key: request.entity.key,
        position: request.position,
        entity: request.entity
      } as TXpertTeamNode

      draft.nodes.push(node)

      return {
        draft
      }
    })
  }
}
