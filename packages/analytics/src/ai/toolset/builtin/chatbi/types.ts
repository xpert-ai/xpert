import {
	CalculatedMeasureSchema,
	CalculatedMember,
	ChartAnnotation,
	ChartDimension,
	ChartDimensionRoleType,
	ChartDimensionSchema,
	ChartMeasureSchema,
	ChartOrient,
	ChartTypeEnum,
	DataSettings,
	DataSettingsSchema,
	Dimension,
	DSCoreService,
	EntityType,
	getPropertyHierarchy,
	ISlicer,
	Measure,
	OrderBy,
	OrderBySchema,
	PieVariant,
	SlicerSchema,
	VariableSchema,
	wrapLevelNumber,
	wrapLevelUniqueName,
	wrapMemberCaption
} from '@metad/ocap-core'
import { Logger } from '@nestjs/common'
import { LanguagesEnum } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { CommandBus } from '@nestjs/cqrs'
import { z } from 'zod'
import { LanguageSchema, TimeSlicerSchema } from '../../schema'
import { AbstractChatBIToolset } from './chatbi-toolset'
import { TTimeSlicerParam } from '../bi-toolset'


export enum ChatBIToolsEnum {
	GET_AVAILABLE_CUBES = 'get_available_cubes',
	GET_CUBE_CONTEXT = 'get_cube_context',
	SHOW_INDICATORS = 'show_indicators',
	ANSWER_QUESTION = 'answer_question',
	CREATE_INDICATOR = 'create_indicator',
	MEMBER_RETRIEVER = 'dimension_member_retriever'
}



export type TChatBICredentials = {
	models: string[]
	dataPermission?: boolean
	/**
	 * Default limit top 100 rows to LLM
	 */
	dataLimit?: number
}

/**
 * @deprecated use TBIContext instead
 */
export type ChatBIContext = {
	chatbi: AbstractChatBIToolset
	dsCoreService: DSCoreService
	entityType?: EntityType
	language?: LanguagesEnum
	logger?: Logger
	commandBus?: CommandBus
}

export type ChatAnswer = {
	language?: string
	preface: string
	visualType: 'ColumnChart' | 'LineChart' | 'PieChart' | 'BarChart' | 'Table' | 'KPI'
	dataSettings: DataSettings
	dimensions: Dimension[]
	measures: Measure[]
	orders: OrderBy[]
	limit: number
	variables: ISlicer[]
	slicers: ISlicer[]
	timeSlicers: TTimeSlicerParam[]
	parameters: { name: string; value: string | number }[]
	calculated_members: CalculatedMember[]
}

export const ChatAnswerSchema = z.object({
	language: LanguageSchema.optional().nullable(),
	preface: z.string().describe('preface of the answer'),
	visualType: z
		.enum(['ColumnChart', 'LineChart', 'PieChart', 'BarChart', 'Table', 'KPI'])
		.optional().nullable()
		.describe('Visual type of result'),
	dataSettings: DataSettingsSchema.optional().nullable().describe('The data settings of the widget'),
	dimensions: z.array(ChartDimensionSchema).optional().nullable().describe('The dimensions used by the chart'),
	measures: z.array(ChartMeasureSchema).optional().nullable().describe('The measures or calculated members used by the chart'),
	orders: z.array(OrderBySchema).optional().nullable().describe('The orders used by the chart'),
	limit: z.number().optional().nullable().describe('The number of rows in the returned result. Note the difference with Top N parameters.'),
	slicers: z.array(SlicerSchema).optional().nullable().describe('The slicers to filter data'),
	timeSlicers: z.array(TimeSlicerSchema).optional().nullable().describe('The time slicers to filter data'),
	parameters: z.array(z.object({
		name: z.string().describe('The name of the parameter'),
		value: z.string().or(z.number()).describe('The value of the parameter')
	})).optional().nullable().describe('The parameters to the query of cube'),
	variables: z.array(VariableSchema).optional().nullable().describe('The variables to the query of cube'),
	calculated_members: z.array(CalculatedMeasureSchema).optional().nullable().describe('Temporary calculated members are used to supplement situations that cannot be met by current measures and indicators in cube.'),
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

/**
 * Extract necessary dimension and measure member information includes dimension, properties and measures.
 * 
 * @param data Raw data array
 * @param chartAnnotation Dimension measures config via ChartAnnotation
 * @param credentials Config of ChatBI toolset
 * @returns 
 */
export function extractDataValue(data: any[], chartAnnotation: {dimensions: Dimension[]; measures: Measure[]}, credentials: TChatBICredentials) {
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