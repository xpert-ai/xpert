import { z } from 'zod'
import { DimensionType, TimeLevelType } from '../../models'
import { Semantics } from '../../annotations'

/**
 * Calculated measure schema for defining a calculated measure in cube
 */
export const CalculatedMeasureSchema = z.object({
  name: z.string().describe('Name of the calculated measure; Name cannot be repeated.'),
  caption: z.string().optional().describe('Caption (short description)'),
  description: z.string().optional().describe('Long description'),
  formula: z.string().describe('MDX expression for the calculated measure in cube'),
  formatting: z
    .object({
      unit: z.string().optional().describe('Unit of the measure; if this is a ratio measurement, value is `%`'),
      decimal: z.string().optional().describe('The decimal of value when formatting the measure')
    })
    .optional()
    .describe('The formatting config of this measure')
})

const BaseHierarchySchema = {
  name: z.string().describe('The name of the hierarchy'),
  caption: z.string().describe('The caption of the hierarchy'),
  tables: z.array(
    z.object({
      name: z.string().describe('The name of the dimension table')
      // join: z.object({})
    })
  ),
  primaryKey: z.string().describe('The primary key of the dimension table'),
  hasAll: z.boolean().describe('Whether the hierarchy has an all level'),
  levels: z
    .array(
      z.object({
        __id__: z.string().optional().describe('The id of the level'),
        name: z.string().describe('The name of the level'),
        caption: z.string().describe('The caption of the level'),
        column: z.string().describe('The column of the level'),
        type: z
          .enum(['String', 'Integer', 'Numeric', 'Boolean', 'Date'])
          .optional()
          .describe('The type of the column, must be set if the column type is not string'),

        levelType: z
          .enum([
            TimeLevelType.TimeYears,
            TimeLevelType.TimeQuarters,
            TimeLevelType.TimeMonths,
            TimeLevelType.TimeWeeks,
            TimeLevelType.TimeDays
          ])
          .optional()
          .describe(
            `The type of level, such as 'TimeYears', 'TimeMonths', 'TimeDays' if dimension is a time dimension`
          ),

        semantics: z
          .object({
            semantic: z
              .enum([
                Semantics['Calendar.Year'],
                Semantics['Calendar.Quarter'],
                Semantics['Calendar.Month'],
                Semantics['Calendar.Week'],
                Semantics['Calendar.Day']
              ])
              .optional()
              .describe(`The semantic of the time level`),
            formatter: z.string().optional().describe(`The formatter of the member key of the time level;
for examples: 'yyyy' for year, '[yyyy].[MM]' for month, '[yyyy].[yyyyMM].[yyyyMMDD]' for day
          `)
          })
          .optional(),

        captionColumn: z.string().optional().describe('The caption column of the level'),
        parentColumn: z.string().optional().describe('The parent column of the parent-child structure level'),
        ordinalColumn: z.string().optional().describe('The ordinal column to sort the members of the level'),

        uniqueMembers: z.boolean().optional().describe('Members of the level is unique'),
        nullParentValue: z.string().optional().describe('The value of the null parent'),

        properties: z.array(
          z.object({
            name: z.string().describe('The name of the property'),
            column: z.string().describe('The column of the property'),
            caption: z.string().optional().describe('The caption of the property'),
            description: z.string().optional().describe('The description of the property')
          })
        ).optional().describe('An array of properties in this level'),
      })
    )
    .describe('An array of levels in this hierarchy')
}

/**
 * Schema for hierarchy, which is used in dimension
 */
export const HierarchySchema = z.object({
  // __id__: z.string().optional().describe('The id of hierarchy, do not set if this is a new hierarchy'),
  ...BaseHierarchySchema
})

const BaseDimensionSchema = {
  name: z.string().describe('The name of dimension'),
  caption: z.string().describe('The caption of dimension'),
  description: z.string().optional().describe('The description of dimension'),
  type: z
    .enum([DimensionType.StandardDimension, DimensionType.TimeDimension])
    .optional()
    .describe('The type of the dimension'),
  hierarchies: z.array(HierarchySchema).describe('An array of hierarchies in this dimension')
}

/**
 * Schema for shared dimension, which is used in cube
 */
export const SharedDimensionSchema = z.object({
  __id__: z.string().optional().describe('The id of the dimension'),
  ...BaseDimensionSchema
})

/**
 * Cube schema for defining a cube structure
 */
export const CubeSchema = z.object({
  name: z.string().optional().describe('The name of the cube'),
  caption: z.string().optional().describe('The caption of the cube'),
  description: z.string().optional().describe('The basic description of the cube'),
  tables: z
    .array(
      z.object({
        name: z.string().describe('The name of the cube fact table')
        // join: z.object({})
      })
    )
    .optional(),
  defaultMeasure: z.string().optional().describe('The default measure of the cube'),
  measures: z
    .array(
      z.object({
        name: z.string().describe('The name of the measure'),
        caption: z.string().describe('The caption of the measure'),
        column: z.string().describe('The column of the measure'),
        aggregator: z
          .enum(['sum', 'avg', 'count', 'max', 'min', 'distinct-count'])
          .optional()
          .describe('The aggregator of the measure')
      })
    )
    .optional()
    .describe('An array of measures in this cube'),
  dimensions: z
    .array(
      z.object({
        ...BaseDimensionSchema,
        hierarchies: z
          .array(
            z.object({
              ...BaseHierarchySchema,
              tables: z
                .array(
                  z.object({
                    name: z.string().describe('The name of the dimension table')
                  })
                )
                .optional(),
              primaryKey: z.string().optional().describe('The primary key of the dimension table'),
            })
          )
          .describe('An array of hierarchies in this dimension')
      })
    )
    .optional()
    .describe('An array of dimensions in this cube'),

  dimensionUsages: z
    .array(
      z.object({
        name: z.string().describe('The name of the dimension usage'),
        caption: z.string().optional().describe('The caption of the dimension usage'),
        source: z.string().describe('The name of the shared dimension'),
        foreignKey: z.string().describe('The foreign key of the fact table that join into the shared dimension'),
        description: z.string().optional().describe('The description of the dimension usage')
      })
    )
    .optional()
    .describe('An array of shared dimensions ref used in this cube'),

  calculatedMembers: z
    .array(CalculatedMeasureSchema)
    .optional()
    .describe('An array of calculated measures in this cube')
})

/**
 * Query schema for querying a cube use statement
 */
export const QueryCubeSchema = z.object({
  statement: z.string().describe('The MDX statement of query the cube')
})
