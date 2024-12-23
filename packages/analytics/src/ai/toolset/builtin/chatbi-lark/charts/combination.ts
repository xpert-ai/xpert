import { PropertyMeasure } from '@metad/ocap-core'
import { formatDataValues } from './utils'

export function createSeriesChart(type: string, x: string, series: string, y: PropertyMeasure, data: any[]) {
	const data0 = data.map((d) => {
		return {
			x: d[x],
			type: d[series] + (y.formatting?.unit === '%' ? '%' : ''),
			y: y.formatting?.unit === '%' ? d[y.name] * 100 : d[y.name],
		}
	})

	const { unit } = formatDataValues(data0, 'y')

	const chartSpec = {
		type: type,
		data: [
			{
				id: '',
				values: data0
			}
		],
		xField: ['x'],
		yField: 'y',
		seriesField: 'type',
		legends: {
			visible: true,
		},
		axes: [
			{
				orient: 'left'
			}
		]
	}
	return {
		chartSpec,
		shortUnit: unit
	}
}

/**
 * 
 * @param type 
 * @param x 
 * @param y0 
 * @param y1 可以为 % 比例的度量类型
 * @param data 
 * @returns 
 */
export function createDualAxisChart(type: string, x: string, y0: PropertyMeasure, y1: PropertyMeasure, data: any[]) {
	const data0 = data.map((d) => {
		return {
			x: d[x],
			y: d[y0.name],
			type: y0.caption
		}
	})

	const { unit } = formatDataValues(data0, 'y')

	const data1 = data.map((d) => {
		return {
			x: d[x],
			y: y1.formatting?.unit === '%' ? d[y1.name] * 100 : d[y1.name],
			type: y1.formatting?.unit === '%' ? y1.caption + '%' : y1.caption,
		}
	})

	formatDataValues(data1, 'y')

	const chartSpec = {
		type: 'common',
		data: [
			{
				id: 'id0',
				values: data0
			},
			{
				id: 'id1',
				values: data1
			}
		],
		series: [
			{
				type: type,
				id: 'bar',
				dataIndex: 0,
				label: { visible: true },
				seriesField: 'type',
				xField: ['x'],
				yField: 'y'
			},
			{
				type: 'line',
				id: 'line',
				dataIndex: 1,
				label: { visible: true },
				seriesField: 'type',
				xField: 'x',
				yField: 'y',
				stack: false
			}
		],
		axes: [
			{ orient: 'left', seriesIndex: [0] },
			{ orient: 'right', seriesId: ['line'], grid: { visible: false } },
			{ orient: 'bottom', label: { visible: true }, type: 'band' }
		],
		legends: {
			visible: true,
			orient: 'bottom'
		}
	}

	return {
		chartSpec,
		shortUnit: unit
	}
}
