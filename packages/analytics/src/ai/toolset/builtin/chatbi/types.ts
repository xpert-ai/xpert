import {
	assignDeepOmitBlank,
	C_MEASURES,
	ChartAnnotation,
	ChartDimension,
	ChartDimensionRoleType,
	ChartDimensionSchema,
	ChartMeasure,
	ChartMeasureSchema,
	ChartOrient,
	ChartTypeEnum,
	cloneDeep,
	DataSettings,
	DataSettingsSchema,
	Dimension,
	DSCoreService,
	EntityType,
	getChartType,
	getPropertyHierarchy,
	ISlicer,
	Measure,
	OrderBy,
	OrderBySchema,
	PieVariant,
	SlicerSchema,
	TimeGranularity,
	TimeRangesSlicer,
	TimeRangeType,
	tryFixDimension,
	VariableSchema,
	wrapLevelNumber,
	wrapLevelUniqueName,
	wrapMemberCaption
} from '@metad/ocap-core'
import { omit } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { upperFirst } from 'lodash'
import { z } from 'zod'
import { AbstractChatBIToolset } from './chatbi-toolset'
import { LanguagesEnum } from '@metad/contracts'

export enum ChatBIToolsEnum {
	GET_AVAILABLE_CUBES = 'get_available_cubes',
	GET_CUBE_CONTEXT = 'get_cube_context',
	SHOW_INDICATORS = 'show_indicators',
	ANSWER_QUESTION = 'answer_question',
	CREATE_INDICATOR = 'create_indicator',
	MEMBER_RETRIEVER = 'dimension_member_retriever'
}

export enum ChatBIVariableEnum {
	INDICATORS = 'chatbi_indicators'
}

export type TChatBICredentials = {
	models: string[]
	dataPermission?: boolean
	/**
	 * Default limit top 100 rows to LLM
	 */
	dataLimit?: number
}

export type ChatBIContext = {
	chatbi: AbstractChatBIToolset
	dsCoreService: DSCoreService
	entityType?: EntityType
	language?: LanguagesEnum
	logger?: Logger
}

export type ChatAnswer = {
	language?: string
	preface: string
	visualType: 'ColumnChart' | 'LineChart' | 'PieChart' | 'BarChart' | 'Table' | 'KPI'
	dataSettings: DataSettings
	dimensions: Dimension[]
	measures: Measure[]
	orders: OrderBy[]
	top: number
	variables: ISlicer[]
	slicers: ISlicer[]
	timeSlicers: TTimeSlicerParam[]
}

const LanguageSchema = z.enum(['en', 'zh', 'zh-Hans']).describe('Language ​​used by user')

export type TTimeSlicerParam = {
	dimension: string
	hierarchy: string
	granularity: TimeGranularity
	start: string
	end: string
}

export const TimeSlicerSchema = z.object({
	// dimension: z
	//   .object({
	// 	dimension: z.string().describe('The name of the dimension'),
	// 	hierarchy: z.string().optional().nullable().describe('The name of the hierarchy in the dimension')
	//   })
	//   .describe('the time dimension'),
	dimension: z.string().describe('The name of time dimension'),
	hierarchy: z.string().optional().nullable().describe('The name of selected hierarchy in time dimension'),
	granularity: z
		.enum([
			TimeGranularity.Year,
			TimeGranularity.Quarter,
			TimeGranularity.Month,
			TimeGranularity.Week,
			TimeGranularity.Day
		])
		.describe('The granularity of the time range'),
	start: z.string().describe('The start period in granularity, example: 20210101, 2022, 202101, 2022Q1, 2021W1'),
	end: z.string().optional().nullable().describe('The end period in granularity, example: 20210101, 2022, 202101, 2022Q1, 2021W1'),
	// lookBack: z.number().optional().nullable().describe('The look back period in granularity'),
	// lookAhead: z.number().optional().nullable().describe('The look ahead period in granularity')
  })

export const ChatAnswerSchema = z.object({
	language: LanguageSchema.optional().nullable(),
	preface: z.string().describe('preface of the answer'),
	visualType: z
		.enum(['ColumnChart', 'LineChart', 'PieChart', 'BarChart', 'Table', 'KPI'])
		.optional().nullable()
		.describe('Visual type of result'),
	dataSettings: DataSettingsSchema.optional().nullable().describe('The data settings of the widget'),
	dimensions: z.array(ChartDimensionSchema).optional().nullable().describe('The dimensions used by the chart'),
	measures: z.array(ChartMeasureSchema).optional().nullable().describe('The measures used by the chart'),
	orders: z.array(OrderBySchema).optional().nullable().describe('The orders used by the chart'),
	top: z.number().optional().nullable().describe('The number of top members'),
	slicers: z.array(SlicerSchema).optional().nullable().describe('The slicers to filter data'),
	timeSlicers: z.array(TimeSlicerSchema).optional().nullable().describe('The time slicers to filter data'),
	variables: z.array(VariableSchema).optional().nullable().describe('The variables to the query of cube')
})

export const IndicatorSchema = z.object({
	language: LanguageSchema,
	modelId: z.string().describe('The id of model'),
	cube: z.string().describe('The cube name'),
	code: z.string().describe('The unique code of indicator'),
	name: z.string().describe(`The caption of indicator in user's language`),
	formula: z.string().describe('The MDX formula for calculated measure'),
	unit: z.string().optional().nullable().describe(`The unit of measure, '%' or orthers`),
	description: z
		.string()
		.describe(
			'The detail description of calculated measure, business logic and cube info for example: the time dimensions, measures or dimension members involved'
		),
	query: z
		.string()
		.describe(
			`A query statement to test this indicator can correctly query the results, you cannot use 'WITH MEMBER' capability. You need include indicator code as measure name in statement like: \n`
			+ `SELECT { [Measures].[The unique code of indicator] } ON COLUMNS, { <dimensions> } ON ROWS FROM [cube]`
		)
})

export const CHART_TYPES = [
	{
		name: 'Line',
		type: ChartTypeEnum.Line,
		orient: ChartOrient.vertical,
		chartOptions: {
			legend: {
				show: true,
				type: 'scroll'
			},
			tooltip: {
				appendToBody: true,
				trigger: 'axis'
			}
		}
	},
	{
		name: 'Column',
		type: ChartTypeEnum.Bar,
		orient: ChartOrient.vertical,
		chartOptions: {
			legend: {
				show: true,
				type: 'scroll'
			},
			tooltip: {
				appendToBody: true,
				trigger: 'axis'
			}
		}
	},
	{
		name: 'Bar',
		type: ChartTypeEnum.Bar,
		orient: ChartOrient.horizontal,
		chartOptions: {
			legend: {
				show: true,
				type: 'scroll'
			},
			tooltip: {
				appendToBody: true,
				trigger: 'axis'
			}
		}
	},
	{
		name: 'Pie',
		type: ChartTypeEnum.Pie,
		variant: PieVariant.None,
		chartOptions: {
			seriesStyle: {
				__showitemStyle__: true,
				itemStyle: {
					borderColor: 'white',
					borderWidth: 1,
					borderRadius: 10
				}
			},
			__showlegend__: true,
			legend: {
				type: 'scroll',
				orient: 'vertical',
				right: 0,
				align: 'right'
			},
			tooltip: {
				appendToBody: true,
				trigger: 'item',
			}
		}
	}
]

/**
 * Try to fix Chart options.
 * 
 * @param chartType 
 * @returns 
 */
export function tryFixChartType(chartType: string) {
	if (chartType?.endsWith('Chart')) {
		chartType = chartType.replace(/Chart$/, '')
		return assignDeepOmitBlank(cloneDeep(getChartType(upperFirst(chartType))?.value.chartType), {}, 5)
	}
	return null
}

/**
 * Try to fix the formatting issues:
 * - `[Sales Amount]`
 * - `[Measures].[Sales Amount]`
 */
export function fixMeasure(measure: ChartMeasure, entityType: EntityType) {
	return {
		...tryFixDimension(measure, entityType),
		dimension: C_MEASURES,
		formatting: {
			shortNumber: true
		},
		palette: {
			name: 'Viridis'
		}
	}
}

/**
 * Try to fix dimensions for chart:
 * - Multi-dimensions: How to assign roles of different dimensions;
 * 
 * @param dimensions 
 * @returns 
 */
export function tryFixDimensions(dimensions: ChartDimension[]) {
	if (!dimensions) return dimensions

	// Ignore role if there is only one dimension
	if (dimensions.length === 1) {
		return dimensions.map((d) => omit(d, 'role'))
	}

	const hasStacked = dimensions.some((d) => d.role === ChartDimensionRoleType.Stacked)
	if (hasStacked) {
		return dimensions.map((d) => d.role === ChartDimensionRoleType.Group ? omit(d, 'role') : d)
	}

	const doubleGroup = dimensions.filter((d) => d.role === ChartDimensionRoleType.Group)
	if (doubleGroup.length > 1) {
		let isFirst = true
		return dimensions.map((d) => {
			if (d.role === ChartDimensionRoleType.Group && isFirst) {
				isFirst = false
				return omit(d, 'role')
			}
			return d
		})
	}

	// Check the number of dimensions without roles
    const dimensionsWithoutRole = dimensions.filter((d) => !d.role)
    // If two or more dimensions do not have a role, the second dimension without a role is set to 'Stacked'
    if (dimensionsWithoutRole.length >= 2) {
        let emptyRoleFoundCount = 0
        return dimensions.map((d) => {
            // Only process dimensions without roles
            if (!d.role) {
                emptyRoleFoundCount++;
                // When a second dimension is found without a role, it is assigned the 'Stacked' role
                if (emptyRoleFoundCount === 2) {
                    return { ...d, role: ChartDimensionRoleType.Stacked }
                }
            }
            return d
        });
    }

	return dimensions
}

export function mapTimeSlicer(param: TTimeSlicerParam[]): TimeRangesSlicer[] {
  return param?.map((_) => {
	return {
		dimension: {
			dimension: _.dimension,
			hierarchy: _.hierarchy,
		},
		currentDate: 'TODAY',
		ranges: [
			{
				...omit(_, 'dimension', 'hierarchy'),
				type: TimeRangeType.Standard,
			}
		]
	}
  })
}

/**
 * Try to fix the formula given by AI
 * 
 * - `WITH MEMBER [Measures].[NewCode] AS '<formula>'` to `'<formula>'`
 * 
 * @param formula 
 */
export function tryFixFormula(formula: string, code: string) {
	const prefix = `WITH MEMBER [Measures].[${code}] AS `
	if (formula.startsWith(prefix)) {
		return formula.slice(prefix.length)
	}
	return formula
}

/**
 * Extract necessary dimension and measure member information includes dimension, properties and measures.
 * 
 * @param data Raw data array
 * @param chartAnnotation Dimension measures config via ChartAnnotation
 * @param credentials Config of ChatBI toolset
 * @returns 
 */
export function extractDataValue(data: any[], chartAnnotation: ChartAnnotation, credentials: TChatBICredentials) {
	const { dataPermission } = credentials

	const dimensions = chartAnnotation?.dimensions
	const measures = chartAnnotation?.measures
	if (data && dimensions) {
		return data.map((_) => {
			const item = {}
			dimensions.forEach((dimension) => {
				const hierarchy = getPropertyHierarchy(dimension)
				item[_[wrapLevelUniqueName(hierarchy)]] = _[hierarchy]
				item[wrapMemberCaption(hierarchy)] = _[wrapMemberCaption(hierarchy)]
				item[wrapLevelNumber(hierarchy)] = _[wrapLevelNumber(hierarchy)]
				// Properties
				dimension.properties?.forEach((name) => {
					item[name] = _[name]
				})
			})

			if (dataPermission && measures) {
				measures.forEach(({measure}) => {
					item[measure] = _[measure]
				})
			}

			return item
		})
	}

	if (dataPermission) {
		return data
	}
	return null
}

export function limitDataResults(items: any[], credentials: TChatBICredentials) {
	// Max limit rows returned for LLM
	const dataLimit = credentials?.dataLimit ?? 100
	let results = items ? JSON.stringify(items.slice(0, dataLimit), null, 2) : 'Empty'
	if (Array.isArray(items) && items.length > dataLimit) {
		results += `\nOnly the first ${dataLimit} pieces of data are returned. There are ${items.length - dataLimit} pieces of data left. Please add more query conditions to view all the data.`
	}

	return results
}