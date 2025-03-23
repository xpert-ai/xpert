import { IHandler } from '@foblex/mediator'
import { UpdateAgentRequest } from './update-agent.request'
import { Store, StoreDef } from '@ngneat/elf'
import { IStudioStore } from '../../types'
import { IXpertAgent } from '../../../../../../@core/types'

export class UpdateAgentHandler implements IHandler<UpdateAgentRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: UpdateAgentRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      const node = draft.nodes.find((item) => item.key === request.key)
      if (!node) {
        throw new Error(`Xpert with key ${request.key} not found`)
      }

      node.entity = {
        ...(node.entity as IXpertAgent),
        ...request.entity
      }
      return {
        draft
      }
    })
  }
}
