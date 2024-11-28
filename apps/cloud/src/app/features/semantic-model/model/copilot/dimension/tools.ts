import { inject } from '@angular/core'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { nanoid } from '@metad/copilot'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { z } from 'zod'
import { SemanticModelService } from '../../model.service'
import { DimensionSchema, HierarchySchema } from '../schema'
import { createOrEditDimension } from './chat'

export function injectCreateDimensionTool() {
  const logger = inject(NGXLogger)
  const translate = inject(TranslateService)
  const modelService = inject(SemanticModelService)

  const createDimensionTool = new DynamicStructuredTool({
    name: 'createDimension',
    description: 'Create or edit shared dimension for cube.',
    schema: DimensionSchema,
    func: async (d) => {
      logger.debug(`Execute copilot action 'createDimension':`, d)
      createOrEditDimension(modelService, d as any)
      return translate.instant('PAC.MODEL.Copilot.CreatedDimension', { Default: 'Created Dimension!' })
    },
    verboseParsingErrors: true,
    verbose: true,
    tags: ['dimension']
  })

  return createDimensionTool
}

export function injectCreateHierarchyTool() {
  const logger = inject(NGXLogger)
  const translate = inject(TranslateService)
  const modelService = inject(SemanticModelService)

  const createHierarchyTool = new DynamicStructuredTool({
    name: 'createHierarchy',
    description: 'Create or edit hierarchy in dimension.',
    schema: z.object({
      dimension: z.string().describe('Name of dimension to create hierarchy'),
      hierarchy: HierarchySchema
    }),
    func: async ({ dimension, hierarchy }) => {
      logger.debug(`Execute copilot action 'createHierarchy' for dimension: '${dimension}' using:`, hierarchy)
      modelService.upsertHierarchy({
        dimension,
        hierarchy: {
          ...hierarchy,
          __id__: nanoid(),
          levels: hierarchy.levels?.map((level) => ({ ...level, __id__: nanoid() }))
        }
      })
      return translate.instant('PAC.MODEL.Copilot.CreatedHierarchy', { Default: 'Created hierarchy!' })
    },
    verboseParsingErrors: true,
    verbose: true,
  })

  return createHierarchyTool
}
