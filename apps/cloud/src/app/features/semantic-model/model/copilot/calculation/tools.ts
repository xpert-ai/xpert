import { Signal, inject } from '@angular/core'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { C_MEASURES, CalculatedMember, FormulaSchema } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { nanoid } from 'nanoid'
import { NGXLogger } from 'ngx-logger'
import { z } from 'zod'
import { ModelEntityService } from '../../entity/entity.service'
import { ModelDesignerType } from '../../types'
import { CalculationSchema } from '@cloud/app/@core/copilot'

export function injectCreateCalculatedTool() {
  const logger = inject(NGXLogger)
  const translate = inject(TranslateService)
  const entityService = inject(ModelEntityService)

  const createCalcalatedTool = new DynamicStructuredTool({
    name: 'createCalcalatedMeasure',
    description: 'Create or edit calculated measure for cube.',
    schema: CalculationSchema,
    func: async (property) => {
      logger.debug(`Create or edit calculated measure:`, property)

      let key = property.__id__ || nanoid()
      const _calculatedMember = entityService.calculatedMembers()?.find((cm) => cm.name === property.name)
      if (_calculatedMember) {
        key = _calculatedMember.__id__
      }

      entityService.upsertCalculatedMeasure({
        ...property,
        dimension: C_MEASURES,
        visible: true,
        __id__: key
      } as CalculatedMember)

      setTimeout(() => {
        entityService.navigateCalculation(key)
      }, 500)

      return `Calculated measure '${property.name}' created!`
    }
  })

  return createCalcalatedTool
}

export function injectEditFormulaTool(calculatedMember: Signal<CalculatedMember>) {
  const logger = inject(NGXLogger)
  const translate = inject(TranslateService)
  const entityService = inject(ModelEntityService)
  const editFormulaTool = new DynamicStructuredTool({
    name: 'editFormula',
    description: 'Create or edit mdx formula',
    schema: z.object({ formula: FormulaSchema }),
    func: async ({ formula }) => {
      logger.debug(`Edit formula '${formula}'`)

      entityService.updateCubeProperty({
        type: ModelDesignerType.calculatedMember,
        id: calculatedMember().__id__,
        model: {
          formula
        }
      })

      return `Formula updated!`
    }
  })
  return editFormulaTool
}
