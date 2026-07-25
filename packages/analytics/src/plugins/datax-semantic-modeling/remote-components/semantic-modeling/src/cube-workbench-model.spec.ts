import { JsonObject } from '../../../../remote-components/shared/runtime'
import { createCubeWorkbenchI18n } from './cube-workbench-i18n'
import { cubeReadiness, measureRows, rowValidationMessage } from './cube-workbench-model'

const cube: JsonObject = {
	name: 'Sales',
	fact: { type: 'table', table: { name: 'fact_sales' } },
	dimensionUsages: [{ name: 'Date', source: 'Date', foreignKey: 'date_id' }],
	measures: [
		{
			name: 'Sales Amount',
			column: 'sales_amount',
			aggregator: 'sum'
		}
	],
	calculatedMembers: [
		{
			name: 'Average Unit Price',
			formula: ''
		}
	]
}

describe('cube workbench model', () => {
	it('normalizes physical and calculated measures into one selectable row model', () => {
		expect(measureRows(cube)).toMatchObject([
			{
				kind: 'physical',
				name: 'Sales Amount',
				column: 'sales_amount',
				aggregator: 'SUM',
				valid: true
			},
			{
				kind: 'calculated',
				name: 'Average Unit Price',
				column: '',
				valid: false
			}
		])
	})

	it('reduces readiness while a calculated measure is incomplete', () => {
		const rows = measureRows(cube)
		expect(cubeReadiness(cube, rows)).toBe(80)
		expect(rowValidationMessage(rows[1], createCubeWorkbenchI18n('zh-Hans'))).toBe(
			'缺少表达式，请为计算度量定义表达式。'
		)
	})

	it('reaches full readiness when all measures are valid', () => {
		const completed: JsonObject = {
			...cube,
			calculatedMembers: [
				{
					name: 'Average Unit Price',
					formula: '[Measures].[Sales Amount] / [Measures].[Sales Quantity]'
				}
			]
		}
		expect(cubeReadiness(completed, measureRows(completed))).toBe(100)
	})
})
