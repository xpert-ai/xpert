import { DestroyRef, inject } from '@angular/core'
import { NgmCopilotEngineService } from '../services'
import { DropAction } from '../types'

/**
 * Provide the process logic of the drop action.
 * 
 * ```ts
   provideCopilotDropAction({
    id: 'pac-model-entitysets',
    implementation: async (event: CdkDragDrop<any[], any[], any>, copilotEngine: CopilotEngine) => {
      this.#logger.debug(`Drop table to copilot chat:`, event)
      const data = event.item.data
      // 获取源表或源多维数据集结构
      const entityType = await firstValueFrom(this.modelService.selectOriginalEntityType(data.name))

      return {
        id: nanoid(),
        role: CopilotChatMessageRoleEnum.User,
        data: {
          columns: [
            { name: 'name', caption: '名称' },
            { name: 'caption', caption: '描述' }
          ],
          content: Object.values(entityType.properties) as any[]
        },
        content: stringifyTableType(entityType),
        templateRef: this.tableTemplate
      }
    }
  })
  ```
 * @param action 
 * @returns 
 */
/**
 * @deprecated use Chatkit
 */
export function provideCopilotDropAction(action: DropAction) {
  const copilotEngine = inject(NgmCopilotEngineService)
  copilotEngine.registerDropAction(action)

  inject(DestroyRef).onDestroy(() => {
    copilotEngine.unregisterDropAction(action.id)
  })

  return action.id
}
