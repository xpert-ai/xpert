import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { IWFNTrigger, WorkflowNodeTypeEnum } from '@cloud/app/@core'
import { EReloadReason, IStudioStore } from '../../types'
import { RemoveNodeRequest } from './remove.request'

export class RemoveNodeHandler implements IHandler<RemoveNodeRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: RemoveNodeRequest): EReloadReason {
    const node = this.store.getValue().draft.nodes.find((item) => item.key === request.key)
    this.store.update((state) => {
      const draft = structuredClone(state.draft)

      draft.nodes = draft.nodes.filter((item) => item.key !== request.key)
      draft.connections = draft.connections.filter(
        (item) => !(item.from.startsWith(request.key) || item.to.startsWith(request.key))
      )

      if (node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.TRIGGER && (<IWFNTrigger>node.entity).from === 'chat') {
        if (draft.team.agentConfig?.parameters) {
          delete draft.team.agentConfig.parameters
        }
      }

      return {
        draft
      }
    })

    switch(node.type) {
      case 'toolset':
        return EReloadReason.TOOLSET_REMOVED
      case 'knowledge':
        return EReloadReason.KNOWLEDGE_REMOVED
      case 'agent':
        return EReloadReason.AGENT_REMOVED
      case 'xpert':
        return EReloadReason.XPERT_REMOVED
      case 'workflow':
        return EReloadReason.WORKFLOW_REMOVED
    }
  }
}
