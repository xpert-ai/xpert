import {
	assignDeepOmitBlank,
	C_MEASURES,
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
	VariableSchema
} from '@metad/ocap-core'
import { omit } from '@metad/server-common'
import { upperFirst } from 'lodash'
import { z } from 'zod'
import { AbstractChatBIToolset } from './chatbi-toolset'
import { LanguagesEnum } from '@metad/contracts'

export enum ChatBIToolsEnum {
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
}

export type ChatBIContext = {
	chatbi: AbstractChatBIToolset
	dsCoreService: DSCoreService
	entityType?: EntityType
	language?: LanguagesEnum
}

export type ChatAnswer = {
	language: string
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

const LanguageSchema = z.enum(['en', 'zh']).describe('Language ​​used by user')

export type TTimeSlicerParam = {
	dimension: {
		dimension: string
		hierarchy: string
	}

	granularity: TimeGranularity
	start: string
	end: string
}

export const TimeSlicerSchema = z.object({
	dimension: z
	  .object({
		dimension: z.string().describe('The name of the dimension'),
		hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension')
	  })
	  .describe('the time dimension'),
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
	end: z.string().optional().describe('The end period in granularity, example: 20210101, 2022, 202101, 2022Q1, 2021W1'),
	// lookBack: z.number().optional().describe('The look back period in granularity'),
	// lookAhead: z.number().optional().describe('The look ahead period in granularity')
  })

export const ChatAnswerSchema = z.object({
	language: LanguageSchema,
	preface: z.string().describe('preface of the answer'),
	visualType: z
		.enum(['ColumnChart', 'LineChart', 'PieChart', 'BarChart', 'Table', 'KPI'])
		.optional()
		.describe('Visual type of result'),
	dataSettings: DataSettingsSchema.optional().describe('The data settings of the widget'),
	dimensions: z.array(ChartDimensionSchema).optional().describe('The dimensions used by the chart'),
	measures: z.array(ChartMeasureSchema).optional().describe('The measures used by the chart'),
	orders: z.array(OrderBySchema).optional().describe('The orders used by the chart'),
	top: z.number().optional().describe('The number of top members'),
	slicers: z.array(SlicerSchema).optional().describe('The slicers to filter data'),
	timeSlicers: z.array(TimeSlicerSchema).optional().describe('The time slicers to filter data'),
	variables: z.array(VariableSchema).optional().describe('The variables to the query of cube')
})

export const IndicatorSchema = z.object({
	language: LanguageSchema,
	modelId: z.string().describe('The id of model'),
	entity: z.string().describe('The cube name'),
	code: z.string().describe('The unique code of indicator'),
	name: z.string().describe(`The caption of indicator in user's language`),
	formula: z.string().describe('The MDX formula for calculated measure'),
	unit: z.string().optional().describe(`The unit of measure, '%' or orthers`),
	description: z
		.string()
		.describe(
			'The detail description of calculated measure, business logic and cube info for example: the time dimensions, measures or dimension members involved'
		),
	query: z
		.string()
		.describe(
			`A query statement to test this indicator can correctly query the results, you need include indicator code as measure name in statement`
		)
})

export const CHART_TYPES = [
	{
		name: 'Line',
		type: ChartTypeEnum.Line,
		orient: ChartOrient.vertical,
		chartOptions: {
			legend: {
				show: true
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
				show: true
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
				show: true
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
				appendToBody: true
			}
		}
	}
]

export function tryFixChartType(chartType: string) {
	if (chartType?.endsWith('Chart')) {
		chartType = chartType.replace(/Chart$/, '')
		return assignDeepOmitBlank(cloneDeep(getChartType(upperFirst(chartType))?.value.chartType), {}, 5)
	}
	return null
}

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

export function tryFixDimensions(dimensions: ChartDimension[]) {
	if (!dimensions) return dimensions

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

	return dimensions
}

export function mapTimeSlicer(param: TTimeSlicerParam[]): TimeRangesSlicer[] {
  return param?.map((_) => {
	return {
		dimension: _.dimension,
		currentDate: 'TODAY',
		ranges: [
			{
				..._,
				type: TimeRangeType.Standard,
			}
		]
	}
  })
}