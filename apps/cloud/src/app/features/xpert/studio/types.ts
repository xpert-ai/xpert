import { Type } from '@angular/core'
import { WorkflowNodeTypeEnum } from '@cloud/app/@core'
import { provideJsonSchemaWidgetStrategy } from '@cloud/app/@shared/forms'

export type XpertStudioNodeStatus = 'success' | 'error' | 'template'

export const VISION_DEFAULT_VARIABLE = `human.files`

export const GROUP_NODE_TYPES = [WorkflowNodeTypeEnum.ITERATOR]

export function provideJsonSchemaWidgets() {
  return provideJsonSchemaWidgetStrategy(
    {
      name: 'ai-model-select',
      /**
       * Lazy load the real component.
       */
      async load(): Promise<Type<unknown>> {
        return import('@cloud/app/@shared/copilot/copilot-model-select/index').then(
          (m) => m.CopilotModelSelectComponent
        )
      }
    },
    {
      name: 'agent-interrupt-on',
      async load(): Promise<Type<unknown>> {
        return import('@cloud/app/@shared/agent/middlewares').then((m) => m.AgentInterruptOnComponent)
      }
    },
    {
      name: 'code-editor',
      async load(): Promise<Type<unknown>> {
        return import('@cloud/app/@shared/editors').then((m) => m.CodeEditorComponent)
      }
    }
  )
}
