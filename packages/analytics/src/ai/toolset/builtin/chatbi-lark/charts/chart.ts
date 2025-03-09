import { PropertyMeasure } from '@metad/ocap-core'
import { formatDataValues } from './utils'

export type FeishuMessageChartType = 'bar' | 'line' | 'pie'

export function createBaseChart(type: FeishuMessageChartType, x: string, measures: PropertyMeasure[], data: any[]) {
	const data0 = []
	measures.forEach((measure) => {
		data.forEach((d) => {
			data0.push({
				x: d[x],
				type: (measure.caption || measure.name) + (measure.formatting?.unit === '%' ? ' %' : ''),
				y: measure.formatting?.unit === '%' ? d[measure.name] * 100 : d[measure.name]
			})
		})
	})

	const { unit } = formatDataValues(data0, 'y')

	const chartSpec: any = {
		type: type,
		data: [
			{
				values: data0
			}
		],
		legends: {
			visible: true
		},
	}

	if (type === 'pie') {
		chartSpec.categoryField = 'x'
		chartSpec.valueField = 'y'
	} else {
		chartSpec.xField = ['x']
		chartSpec.yField = 'y'
		chartSpec.seriesField = 'type'
		chartSpec.axes = [
				{
					orient: 'left'
				}
			]
	}

	return {
		chartSpec,
		shortUnit: unit,
	}
}
