import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { ToConnectionViewModelHandler } from '../../connection'
import { IStudioStore } from '../../types'
import { CreateTeamRequest } from './create.request'
import { createXpertGraph } from '../../../../../../@core/types'

export class CreateTeamHandler implements IHandler<CreateTeamRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: CreateTeamRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)

      // Create sub graph for xpert
      const xpert = request.team

      const {nodes, connections, size} = createXpertGraph(xpert, request.position)

      draft.nodes.push({
        type: 'xpert',
        key: request.team.id,
        position: request.position,
        size: size,
        entity: request.team,
        nodes,
        connections,
        expanded: true
      })

      return {
        draft
      }
    })
  }
}
