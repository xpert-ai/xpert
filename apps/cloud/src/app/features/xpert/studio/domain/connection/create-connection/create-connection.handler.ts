import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { IStudioStore } from '../../types'
import { CreateConnectionRequest } from './create-connection.request'

export class CreateConnectionHandler implements IHandler<CreateConnectionRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: CreateConnectionRequest): void {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)

      const outputId = removeConnSuffix(request.outputId)
      const inputId = removeConnSuffix(request.inputId)
      // Remove old connection
      if (request.oldFInputId) {
        const oldFInputId = removeConnSuffix(request.oldFInputId)
        draft.connections = draft.connections.filter((item) => !(item.from === outputId && item.to === oldFInputId))
      }
      
      if (inputId && outputId !== inputId) {
        // Create new connection
        const targetNode = draft.nodes.find((item) => item.key === inputId)
        if (!targetNode) {
          throw new Error(`Target node with id ${inputId} not found`)
        }

        const key = outputId + '/' + inputId
        if (!draft.connections.some((item) => item.key === key)) {
          draft.connections.push({
            type: request.outputId.endsWith('/edge') ? 'edge' : targetNode.type,
            key,
            from: outputId,
            to: removeConnSuffix(request.inputId)
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
  return id ? removeSuffix(id, '/agent', '/knowledge', '/toolset', '/xpert', '/edge') : id
}

function removeSuffix(str: string, ...suffixs: string[]) {
  suffixs.forEach((suffix) => {
    // 检查字符串是否以指定的后缀结尾
    if (str.endsWith(suffix)) {
      // 使用 slice 方法删除后缀
      str = str.slice(0, -suffix.length)
    }
  })
  
  // 如果字符串不以后缀结尾，则返回原字符串
  return str
}