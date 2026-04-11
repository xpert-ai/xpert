import { Signal, inject } from '@angular/core'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { nanoid } from '@xpert-ai/copilot'
import { CalculationSchema, DataSettingsSchema } from '@xpert-ai/core'
import { CalculatedProperty, CalculationType, DataSettings } from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { NGXLogger } from 'ngx-logger'
import { z } from 'zod'

export function injectCreateFormulaMeasureTool() {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)

  const createFormulaTool = new DynamicStructuredTool({
    name: 'createFormulaMeasure',
    description: 'Create or edit calculated measure for cube.',
    schema: z.object({
      dataSettings: DataSettingsSchema.optional(),
      property: CalculationSchema
    }),
    func: async ({ dataSettings, property: { __id__, name, caption, formula } }) => {
      const key = __id__ || nanoid()
        return ``
    }
  })

  return createFormulaTool
}
