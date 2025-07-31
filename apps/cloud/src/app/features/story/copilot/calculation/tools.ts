import { Signal, inject } from '@angular/core'
import { DynamicStructuredTool } from '@langchain/core/tools'
import {
  AggregationProperty,
  C_MEASURES,
  CalculatedProperty,
  CalculationType,
  CompareToEnum,
  DataSettings,
  DataSettingsSchema,
  tryFixDimension,
  VarianceMeasureProperty
} from '@metad/ocap-core'
import { NxStoryService } from '@metad/story/core'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom } from 'rxjs'
import { ConditionalAggregationSchema, VarianceMeasureSchema } from '../schema'
import { CalculationSchema } from '@cloud/app/@core/copilot'

export function injectCreateFormulaMeasureTool(
  defaultDataSettings: Signal<DataSettings>,
  callback: (dataSettings: DataSettings, key: string) => void
) {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)

  const createFormulaTool = new DynamicStructuredTool({
    name: 'createFormulaMeasure',
    description: 'Create or edit calculated measure for cube.',
    schema: z.object({
      dataSettings: DataSettingsSchema.optional(),
      property: CalculationSchema
    }),
    func: async ({dataSettings, property}) => {
      const key = property.__id__ || nanoid()
      try {
        const _dataSettings = dataSettings as DataSettings ?? defaultDataSettings()
        const calculation = {
          __id__: key,
          ...property,
          calculationType: CalculationType.Calculated,
        } as CalculatedProperty
        storyService.addCalculationMeasure({ dataSettings: _dataSettings, calculation })

        logger.debug(`Calculation measure created: `, _dataSettings, calculation)

        callback(_dataSettings, key)

        return `A calculation measure of formula type with ID '${key}' has been created!`
      } catch (error: any) {
        return `Error creating calculation measure of formula type: ${error.message}`
      }
    }
  })

  return createFormulaTool
}

export function injectCreateConditionalAggregationTool(
  defaultDataSettings: Signal<DataSettings>,
  callback: (dataSettings: DataSettings, key: string) => void
) {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)

  const createConditionalAggregationTool = new DynamicStructuredTool({
    name: 'createConditionalAggregation',
    description: 'Create conditional aggregation measure for cube.',
    schema: z.object({
      dataSettings: DataSettingsSchema.optional(),
      property: ConditionalAggregationSchema
    }),
    func: async ({dataSettings, property}) => {
      const key = property.__id__ || nanoid()
      const _dataSettings = dataSettings as DataSettings ?? defaultDataSettings()

      try {
        const entityType = await firstValueFrom(storyService.selectEntityType(_dataSettings))
        const calculation = {
          ...property,
          __id__: key,
          calculationType: CalculationType.Aggregation
        } as AggregationProperty

        if (calculation.conditionalDimensions?.length) {
          calculation.useConditionalAggregation = true
          calculation.conditionalDimensions = calculation.conditionalDimensions.map((dimension) => {
            return {
              ...dimension,
              ...tryFixDimension(dimension, entityType)
            }
          })
        }

        if (calculation.aggregationDimensions?.length) {
          calculation.aggregationDimensions = calculation.aggregationDimensions.map((dimension) => {
            return {
              ...dimension,
              ...tryFixDimension(dimension, entityType)
            }
          })
        }

        storyService.addCalculationMeasure({
          dataSettings: _dataSettings,
          calculation
        })

        logger.debug(`A calculation measure of conditional aggregation type has been created: `, _dataSettings, calculation)

        callback(_dataSettings, key)

        return `A calculation measure of conditional aggregation type with ID '${key}' has been created!`
      } catch (error: any) {
        return `Error creating conditional aggregation calculation measure: ${error.message}`
      }
    }
  })

  return createConditionalAggregationTool
}

export function injectCreateVarianceMeasureTool(
  defaultDataSettings: Signal<DataSettings>,
  callback: (dataSettings: DataSettings, key: string) => void
) {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)
  const createVarianceMeasureTool = new DynamicStructuredTool({
    name: 'createVarianceMeasure',
    description: 'Create variance measure for cube.',
    schema: z.object({
      dataSettings: DataSettingsSchema.optional(),
      property: VarianceMeasureSchema
    }),
    func: async ({dataSettings, property}) => {
      const key = property.__id__ || nanoid()
      const _dataSettings = dataSettings as DataSettings ?? defaultDataSettings()
      try {
        storyService.addCalculationMeasure({
          dataSettings: _dataSettings,
          calculation: {
            ...property,
            measure: {
              ...property.measure,
              dimension: C_MEASURES
            },
            compareA: {
              type: CompareToEnum.CurrentMember
            },
            __id__: key,
            calculationType: CalculationType.Variance
          } as VarianceMeasureProperty
        })

        logger.debug(`Variance calculation measure created: `, _dataSettings, property)

        callback(_dataSettings, key)

        return `Variance calculation measure created!`
      } catch (error: any) {
        return `Error creating cariance calculation measure: ${error.message}`
      }
    }
  })

  return createVarianceMeasureTool
}
