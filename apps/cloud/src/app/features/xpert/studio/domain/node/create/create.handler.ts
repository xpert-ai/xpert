import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { TXpertTeamNode, XpertTypeEnum } from '@cloud/app/@core'
import { IStudioStore } from '../../types'
import { CreateNodeRequest } from './create.request'
import { genAgentKey } from '../../../../utils'

export class CreateNodeHandler implements IHandler<CreateNodeRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: CreateNodeRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)

      if (request.entity?.id) {
        if (draft.nodes.find((item) => item.entity?.id === request.entity.id)) {
          throw new Error(`Node with id ${request.entity.id} already added!`)
        }
      }

      const key = request.entity?.id ?? genAgentKey()
      let entity = null
      switch(request.type) {
        case 'agent': {
          entity = {
            type: XpertTypeEnum.Agent,
            key,
            ...(request.entity ?? {})
          }

          draft.team.agentConfig ??= {} 
          draft.team.agentConfig.disableOutputs ??= []
          draft.team.agentConfig.disableOutputs.push(key)
          break
        }
        default: {
          entity = request.entity
        }
      }

      const node = {
        type: request.type,
        key,
        position: request.position,
        entity
      } as TXpertTeamNode

      draft.nodes.push(node)

      return {
        draft
      }
    })
  }
}
