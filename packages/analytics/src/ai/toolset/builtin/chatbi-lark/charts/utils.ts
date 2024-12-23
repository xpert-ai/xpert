import { isNil } from 'lodash'

export function formatDataValues(data: any[], propertyName: string): { values: any[]; unit: string } {
	if (!Array.isArray(data) || data.length === 0) {
		return { values: [], unit: '' }
	}

	const maxValue = Math.max(...data.map((item) => item[propertyName]))
	let divisor = 1
	let unit = ''

	if (maxValue >= 100 * 10000 * 10000) {
		divisor = 100000000
		unit = '亿'
	} else if (maxValue >= 100 * 10000) {
		divisor = 10000
		unit = '万'
	}

	data.forEach(
		(item) => (item[propertyName] = isNil(item[propertyName]) ? null : 
		divisor === 1 ? (item[propertyName]).toFixed(1) :
			(item[propertyName] / divisor).toFixed(1))
	)

	return {
		values: data,
		unit: unit
	}
}
