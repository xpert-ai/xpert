import { z } from 'zod'
import {
  EntityType,
  getEntityVariables,
  TimeGranularity,
  TimeRangeType,
  VariableEntryType,
  wrapBrackets
} from '../../models'
import { ISlicer } from '../../types'
import { MemberSchema, tryFixDimension } from './common'

export const BaseSlicerSchema = {
  dimension: z
    .object({
      dimension: z.string().describe('The name of the dimension'),
      hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension'),
      level: z.string().optional().describe('The name of the level in the hierarchy'),
      // parameter: z.string().optional().describe('The name of variable reference to') // Variable slicer (has parameter) already exists alone.
    })
    .describe('dimension of the slicer'),
  exclude: z.boolean().optional().describe('Exclude members'),
  members: z.array(MemberSchema).describe('Members in the slicer')
}

export const SlicerSchema = z.object({...BaseSlicerSchema})

/**
 * @deprecated 
 */
export const TimeSlicerSchema = z.object({
  dimension: z
    .object({
      dimension: z.string().describe('The name of the dimension'),
      hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension')
    })
    .describe('the time dimension'),
  ranges: z.array(
    z.object({
      type: z.enum([TimeRangeType.Standard, TimeRangeType.Offset]).describe('The type of time range'),
      granularity: z
        .enum([
          TimeGranularity.Year,
          TimeGranularity.Quarter,
          TimeGranularity.Month,
          TimeGranularity.Week,
          TimeGranularity.Day
        ])
        .describe('The granularity of the time range'),
      lookBack: z.number().optional().describe('The look back period in granularity'),
      lookAhead: z.number().optional().describe('The look ahead period in granularity')
    })
  )
})

/**
 * Try to fix the slicer formatting issues given by LLM
 */
export function tryFixSlicer(slicer: ISlicer, entityType: EntityType) {
  return {
    ...slicer,
    dimension: tryFixDimension(slicer.dimension, entityType)
  }
}

export function tryFixVariableSlicer(slicer: ISlicer, entityType: EntityType) {
  const variable = slicer.dimension.parameter
  let parameter = null
  if (entityType.parameters[variable]) {
    parameter = variable
  } else {
    // AI may provide variable caption
    const _parameter = getEntityVariables(entityType).find((item) => item.caption === variable)
    if (_parameter) {
      parameter = _parameter.name
    } else {
      // May not be enclosed in brackets
      parameter = entityType.parameters[wrapBrackets(variable)]?.name
    }
  }

  if (!parameter) {
    throw new Error(`Can't find variable '${variable}', please confirm you use the name of variable`)
  }

  return {
    ...slicer,
    dimension: {
      ...slicer.dimension,
      parameter
    }
  }
}

export function getDefaultSlicersForVariables(entityType: EntityType, variableEntryType?: VariableEntryType) {
  const variables = getEntityVariables(entityType)
  const slicers = variables
    .filter((variable) => (variableEntryType ? variable.variableEntryType === variableEntryType : true))
    .map((variable) => ({
      dimension: {
        dimension: variable.referenceDimension,
        hierarchy: variable.referenceHierarchy,
        parameter: variable.name
      },
      members: variable.defaultLow
        ? [
            {
              key: variable.defaultLow,
              caption: variable.defaultLowCaption
            }
          ]
        : []
    }))

  return slicers
}
