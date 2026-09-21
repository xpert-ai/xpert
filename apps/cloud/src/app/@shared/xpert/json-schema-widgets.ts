import { Type } from '@angular/core'
import { provideJsonSchemaWidgetStrategy } from '../forms/json-schema-property/json-schema-widget-registry.service'

export function provideJsonSchemaWidgets() {
  return provideJsonSchemaWidgetStrategy(
    {
      name: 'skills-select',
      load: () => import('@cloud/app/@shared/skills').then((m) => m.XpertSkillSelectComponent)
    },
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
