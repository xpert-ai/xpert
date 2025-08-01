import { ENTITY_TYPE_SALESORDER, workOutTimeRangeSlicers } from '@metad/ocap-core'
import { tryFixChartType } from '../../../types'
import { mapTimeSlicer, TTimeSlicerParam } from '../types'

describe('tryFixChartType', () => {
	it('should return a fixed chart type when input ends with "Chart"', () => {
		const input = 'BarChart'
		const result = tryFixChartType(input)
		expect(result).not.toBeNull()
		expect(result.type).toBe('Bar')
	})

	it('should return null when input does not end with "Chart"', () => {
		const input = 'Bar'
		const result = tryFixChartType(input)
		expect(result).toBeNull()
	})

	it('should return null when input does not end with "Table"', () => {
		const input = 'Table'
		const result = tryFixChartType(input)
		expect(result).toBeNull()
	})

	it('should handle empty string input', () => {
		const input = ''
		const result = tryFixChartType(input)
		expect(result).toBeNull()
	})

	it('should handle null input', () => {
		const result = tryFixChartType(null)
		expect(result).toBeNull()
	})
})

const TIME_SLICER_DATA = [
	{
		dimension: '[Order Date]',
		hierarchy: '[Order Date]',
		granularity: 'Month',
		start: '2021-01',
		end: '2023-12'
	} as TTimeSlicerParam
]
describe('mapTimeSlicer', () => {
	it('should correctly map TIME_SLICER_DATA to expected output', () => {
		const result = mapTimeSlicer(TIME_SLICER_DATA)
		expect(result).toEqual([
			{
				dimension: {
					dimension: '[Order Date]',
					hierarchy: '[Order Date]'
				},
				currentDate: 'TODAY',
				ranges: [
					{
						granularity: 'Month',
						start: '2021-01',
						end: '2023-12',
						type: 'Standard'
					}
				]
			}
		])
	})

	it('should correctly map TIME_SLICER_DATA to expected output', () => {
		const result = mapTimeSlicer([
			{
				dimension: '[Time]',
				granularity: 'Month',
				start: '2021-01',
				end: '2023-12'
			} as TTimeSlicerParam
		]).map((slicer) => workOutTimeRangeSlicers(new Date(), slicer, ENTITY_TYPE_SALESORDER))
		expect(result).toEqual([
			[
				{
					dimension: {
						dimension: '[Time]'
					},
					members: [
						{
							key: '[2021].[1]',
							value: '[2021].[1]'
						},
						{
							key: '[2023].[12]',
							value: '[2023].[12]'
						}
					],
					operator: 'BT'
				}
			]
		])
	})

	it('should handle missing start and end fields', () => {
		const input = [
			{
				dimension: '[Order Date]',
				hierarchy: '[Order Date]',
				granularity: 'Month'
			} as TTimeSlicerParam
		]
		const result = mapTimeSlicer(input)
		expect(result).toEqual({
			dimension: '[Order Date]',
			hierarchy: '[Order Date]',
			granularity: 'Month',
			range: {
				start: undefined,
				end: undefined
			}
		})
	})

	it('should return null for null input', () => {
		const result = mapTimeSlicer(null)
		expect(result).toBeNull()
	})

	it('should return null for undefined input', () => {
		const result = mapTimeSlicer(undefined)
		expect(result).toBeNull()
	})

	it('should handle empty object input', () => {
		const result = mapTimeSlicer([])
		expect(result).toEqual({
			dimension: undefined,
			hierarchy: undefined,
			granularity: undefined,
			range: {
				start: undefined,
				end: undefined
			}
		})
	})
})
