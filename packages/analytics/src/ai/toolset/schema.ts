import {
	ChartDimensionSchema,
	ChartMeasureSchema,
	OrderBySchema,
	SlicerSchema,
	TimeSlicerSchema,
	VariableSchema
} from '@metad/ocap-core'
import { z } from 'zod'

export const LanguageSchema = z.enum(['en', 'zh', 'zh-Hans']).describe('Language ​​used by user')

/**
 * Basic indicator schema
 */
export const BasicIndicatorSchema = z.object({
	modelId: z.string().describe('The id of model'),
	cube: z.string().describe('The cube name'),
	code: z.string().describe('The unique code of indicator'),
	name: z.string().describe(`The caption of indicator in user's language`),
	description: z
		.string()
		.describe(
			'The detail description of calculated measure, business logic and cube info for example: the time dimensions, measures or dimension members involved'
		),
	calendar: z.string().optional().nullable().describe('The calendar hierarchy used by indicator'),
	measure: z.string().describe('The measure name of indicator'),
	filters: z.array(z.object({
		dimension: z.string().describe('The dimension name of filter'),
		hierarchy: z.string().optional().nullable().describe('The hierarchy name of filter'),
		member: z.string().optional().nullable().describe('The member name of filter'),
	})).describe('The filter conditions used to limit measure values'),
	query: z
		.string()
		.describe(
			`A query statement to test this indicator can correctly query the results, you cannot use 'WITH MEMBER' capability. You need include indicator code as measure name in statement like: \n` +
				`SELECT { [Measures].[The unique code of indicator] } ON COLUMNS, { <dimensions> } ON ROWS FROM [cube]`
		)
})

/**
 * Derive indicator schema (using formula)
 */
export const IndicatorSchema = z.object({
	language: LanguageSchema,
	modelId: z.string().describe('The id of model'),
	cube: z.string().describe('The cube name'),
	code: z.string().describe('The unique code of indicator'),
	name: z.string().describe(`The caption of indicator in user's language`),
	description: z
		.string()
		.describe(
			'The detail description of calculated measure, business logic and cube info for example: the time dimensions, measures or dimension members involved'
		),
	calendar: z.string().optional().nullable().describe('The calendar hierarchy used by indicator'),
	formula: z.string().describe('The MDX formula for calculated measure'),
	unit: z.string().optional().nullable().describe(`The unit of measure, '%' or orthers`),
	query: z
		.string()
		.describe(
			`A query statement to test this indicator can correctly query the results, you cannot use 'WITH MEMBER' capability. You need include indicator code as measure name in statement like: \n` +
				`SELECT { [Measures].[The unique code of indicator] } ON COLUMNS, { <dimensions> } ON ROWS FROM [cube]`
		)
})

export const PreviewCubeSchema = z.object({
	preface: z.string().describe('preface of the answer'),
	visualType: z
		.enum(['ColumnChart', 'LineChart', 'PieChart', 'BarChart', 'Table', 'KPI'])
		.optional()
		.nullable()
		.describe('Visual type of result'),
	dimensions: z.array(ChartDimensionSchema).optional().nullable().describe('The dimensions used by the chart'),
	measures: z.array(ChartMeasureSchema).optional().nullable().describe('The measures used by the chart'),
	orders: z.array(OrderBySchema).optional().nullable().describe('The orders used by the chart'),
	top: z.number().optional().nullable().describe('The number of top members'),
	slicers: z.array(SlicerSchema).optional().nullable().describe('The slicers to filter data'),
	timeSlicers: z.array(TimeSlicerSchema).optional().nullable().describe('The time slicers to filter data'),
	variables: z.array(VariableSchema).optional().nullable().describe('The variables to the query of cube')
})
