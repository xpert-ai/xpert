import { PropertyMeasure } from '@metad/ocap-core'
import { formatDataValues } from './utils'

export function createBaseChart(type: string, x: string, measures: PropertyMeasure[], data: any[]) {
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

	const chartSpec = {
		type: type,
		data: [
			{
				values: data0
			}
		],
		xField: ['x'],
		yField: 'y',
		seriesField: 'type',
		legends: {
			visible: true
		},
		axes: [
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
