import { assignDeepOmitBlank, C_MEASURES, ChartMeasure, ChartOrient, ChartType, ChartTypeEnum, cloneDeep, DSCoreService, EntityType, getChartType, PieVariant, tryFixDimension } from "@metad/ocap-core"
import { Logger } from "@nestjs/common"
import { omit, upperFirst } from "lodash"

export enum ChatBIToolsEnum {
	SHOW_INDICATORS = 'show_indicators',
	ANSWER_QUESTION = 'answer_question',
	CREATE_INDICATOR = 'create_indicator'
}

export enum ChatBIVariableEnum {
	INDICATORS = 'chatbi_indicators'
}

export type TChatBICredentials = {
	models: string[]
	dataPermission?: boolean
}

export type ChatBIContext = {
	dsCoreService: DSCoreService
	entityType: EntityType
	logger?: Logger
}


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

export function tryFixChartType(chartType: ChartType) {
	return assignDeepOmitBlank(
		cloneDeep(getChartType(upperFirst(chartType.type))?.value.chartType),
		omit(chartType, 'type'),
		5
	)
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
