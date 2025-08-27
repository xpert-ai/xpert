import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { IStudioStore } from '../../types'
import { CreateConnectionRequest } from './create-connection.request'

export class CreateConnectionHandler implements IHandler<CreateConnectionRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: CreateConnectionRequest): void {
    const draft = this.store.getValue().draft

    const outputId = removeConnSuffix(request.outputId)
    const inputId = removeConnSuffix(request.inputId)

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
      
      // Remove old connection
      if (request.oldFInputId) {
        const oldFInputId = removeConnSuffix(request.oldFInputId)
        draft.connections = draft.connections.filter((item) => !(item.from === outputId && item.to === oldFInputId))
      }
      
      if (inputId && outputId !== inputId) {
        // Create new connection
        const targetNode = draft.nodes.find((item) => item.key === inputId)

        const key = outputId + '/' + inputId
        if (!draft.connections.some((item) => item.key === key)) {
          draft.connections.push({
            type: (targetNode.type === 'agent' || targetNode.type === 'workflow') && request.outputId.endsWith('/edge') ? 'edge' : targetNode.type,
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

function removeConnSuffix(id: string) {
  return id ? removeSuffix(id, '/agent', '/knowledge', '/toolset', '/xpert', '/workflow', '/edge') : id
}

function removeSuffix(str: string, ...suffixs: string[]) {
  suffixs.forEach((suffix) => {
    if (str.endsWith(suffix)) {
      str = str.slice(0, -suffix.length)
    }
  })
  return str
}