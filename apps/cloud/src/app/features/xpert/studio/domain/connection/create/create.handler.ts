import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { IStudioStore } from '../../types'
import { CreateConnectionRequest } from './create.request'
import { removeConnSuffix } from '../types'

export class CreateConnectionHandler implements IHandler<CreateConnectionRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: CreateConnectionRequest): void {
    const draft = this.store.getValue().draft

    const outputId = removeConnSuffix(request.connection.sourceId)
    const inputId = removeConnSuffix(request.connection.targetId)

    // Check target
    if (inputId && outputId !== inputId) {
      const targetNode = draft.nodes.find((item) => item.key === inputId)
      if (!targetNode) {
        // throw new Error(`Target node with id ${inputId} not found`)
        return
      }
    }

    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      if (inputId && outputId !== inputId) {
        // Create new connection
        const targetNode = draft.nodes.find((item) => item.key === inputId)

        const key = outputId + '/' + inputId
        if (!draft.connections.some((item) => item.key === key)) {
          draft.connections.push({
            type:
              (targetNode.type === 'agent' || targetNode.type === 'workflow') &&
              request.connection.sourceId.endsWith('/edge')
                ? 'edge'
                : targetNode.type,
            key,
            from: outputId,
            to: inputId
          })
        }
      }

      return {
        draft
      }
    })
  }
}
