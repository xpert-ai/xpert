import {
	appendDerivedItem,
	findDerivedItem,
	listDerivedItems,
	moveDerivedItem,
	updateDerivedItem
} from './calculation-studio-model'

describe('calculation studio model', () => {
	const schema = {
		cubes: [
			{
				name: 'Sales',
				calculations: [{ name: 'Profit', expression: '[Measures].[Revenue] - [Measures].[Cost]' }],
				calculatedMembers: [{ name: 'Margin', formula: '[Measures].[Profit] / [Measures].[Revenue]' }],
				parameters: []
			},
			{
				name: 'Inventory',
				calculations: [],
				calculatedMembers: [],
				parameters: []
			}
		]
	}

	it('lists every derived item with its owning Cube', () => {
		expect(listDerivedItems(schema)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'calculation', name: 'Profit', scope: 'Sales' }),
				expect.objectContaining({ kind: 'calculatedMember', name: 'Margin', scope: 'Sales' })
			])
		)
	})

	it('creates and immediately addresses a calculation in the selected Cube', () => {
		const result = appendDerivedItem(schema, 'calculation', 1)

		expect(result?.selection).toEqual({ kind: 'calculation', cubeIndex: 1, index: 0 })
		expect(findDerivedItem(result?.schema ?? {}, result?.selection ?? null)?.value).toMatchObject({
			name: 'Calculation 1',
			expression: ''
		})
	})

	it('updates a selected expression without changing its scope', () => {
		const next = updateDerivedItem(
			schema,
			{ kind: 'calculation', cubeIndex: 0, index: 0 },
			'expression',
			'[Measures].[Revenue]'
		)

		expect(findDerivedItem(next, { kind: 'calculation', cubeIndex: 0, index: 0 })?.value).toMatchObject({
			name: 'Profit',
			expression: '[Measures].[Revenue]'
		})
	})

	it('moves an item to another Cube and returns its new selection', () => {
		const result = moveDerivedItem(schema, { kind: 'calculation', cubeIndex: 0, index: 0 }, 1)

		expect(result?.selection).toEqual({ kind: 'calculation', cubeIndex: 1, index: 0 })
		expect(listDerivedItems(result?.schema ?? {})).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'calculation', name: 'Profit', scope: 'Inventory' })
			])
		)
	})
})
