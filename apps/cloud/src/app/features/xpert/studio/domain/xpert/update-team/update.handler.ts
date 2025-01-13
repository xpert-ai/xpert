import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { IStudioStore } from '../../types'
import { UpdateXpertTeamRequest } from './update.request'

export class UpdateXpertTeamHandler implements IHandler<UpdateXpertTeamRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: UpdateXpertTeamRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      draft.team = {
        ...draft.team,
        ...request.xpert
      }

      return {
        draft
      }
    })
  }
}
