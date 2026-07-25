import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { buildGraph, replaceSelectionValue, selectionValue, StudioFieldSelection } from './er-diagram-model'
import { resizeDiagramViewport, zoomDiagramViewport } from './er-diagram-viewport'
import { createRelationshipI18n } from './relationship-i18n'

const schema: JsonObject = {
	name: 'Sales',
	dimensions: [
		{
			name: 'Date',
			hierarchies: [
				{
					name: 'Calendar',
					tables: [{ name: 'dim_date' }],
					levels: [
						{
							name: 'Year',
							column: 'year',
							type: 'Integer'
						}
					]
				}
			]
		}
	],
	cubes: [
		{
			name: 'Sales',
			fact: { type: 'table', table: { name: 'fact_sales' } },
			measures: [
				{
					name: 'Revenue',
					column: 'revenue',
					aggregator: 'sum'
				}
			],
			dimensionUsages: [{ name: 'Date', source: 'Date', foreignKey: 'date_id' }]
		}
	]
}

describe('semantic ER diagram model', () => {
	it('creates selectable ER fields and relationship edges from the semantic schema', () => {
		const graph = buildGraph(schema)

		expect(graph.nodes).toHaveLength(2)
		expect(graph.nodes.find((node) => node.kind === 'dimension')?.fields[0]).toMatchObject({
			name: 'Year',
			column: 'year',
			dataType: 'Integer'
		})
		expect(graph.nodes.find((node) => node.kind === 'cube')?.fields[0]).toMatchObject({
			name: 'Revenue',
			column: 'revenue',
			dataType: 'sum'
		})
		expect(graph.edges).toEqual([
			{
				id: 'usage:0:0',
				source: 'cube:0',
				target: 'dimension:0',
				label: 'date_id'
			}
		])
	})

	it('updates a selected nested level without replacing sibling schema collections', () => {
		const selection: StudioFieldSelection = {
			kind: 'field',
			nodeKind: 'dimension',
			nodeIndex: 0,
			fieldKind: 'level',
			hierarchyIndex: 0,
			fieldIndex: 0
		}
		const level = selectionValue(schema, selection)
		expect(readString(level, 'name')).toBe('Year')

		const next = replaceSelectionValue(schema, selection, {
			...level,
			caption: 'Fiscal year'
		})

		expect(readString(selectionValue(next, selection), 'caption')).toBe('Fiscal year')
		expect(buildGraph(next).edges).toHaveLength(1)
	})

	it('updates a selected measure schema in the owning cube', () => {
		const selection: StudioFieldSelection = {
			kind: 'field',
			nodeKind: 'cube',
			nodeIndex: 0,
			fieldKind: 'measure',
			fieldIndex: 0
		}
		const measure = selectionValue(schema, selection)
		const next = replaceSelectionValue(schema, selection, {
			...measure,
			aggregator: 'avg',
			formatString: '#,##0.00'
		})

		expect(selectionValue(next, selection)).toMatchObject({
			name: 'Revenue',
			aggregator: 'avg',
			formatString: '#,##0.00'
		})
	})
})

describe('relationship i18n', () => {
	it('keeps field-editor catalogs complete across supported locales', () => {
		expect(createRelationshipI18n('en-US').t('fieldProperties')).toBe('Field properties')
		expect(createRelationshipI18n('zh-Hans').t('fieldProperties')).toBe('字段属性')
		expect(createRelationshipI18n('zh-Hant').t('fieldProperties')).toBe('欄位屬性')
	})
})

describe('semantic ER diagram viewport', () => {
	it('keeps the same world point under the canvas center while zooming', () => {
		const before = {
			pan: { x: 40, y: 20 },
			zoom: 0.5
		}
		const anchor = { x: 400, y: 300 }
		const worldAnchor = {
			x: (anchor.x - before.pan.x) / before.zoom,
			y: (anchor.y - before.pan.y) / before.zoom
		}
		const after = zoomDiagramViewport(before, 1.2, anchor)

		expect(after.zoom).toBeCloseTo(0.6)
		expect((anchor.x - after.pan.x) / after.zoom).toBeCloseTo(worldAnchor.x)
		expect((anchor.y - after.pan.y) / after.zoom).toBeCloseTo(worldAnchor.y)
	})

	it('preserves pan and zoom intent when the ER panel is resized', () => {
		const before = {
			pan: { x: -120, y: 48 },
			zoom: 0.75
		}
		const previousSize = { width: 900, height: 640 }
		const nextSize = { width: 720, height: 640 }
		const previousWorldCenter = {
			x: (previousSize.width / 2 - before.pan.x) / before.zoom,
			y: (previousSize.height / 2 - before.pan.y) / before.zoom
		}
		const after = resizeDiagramViewport(before, previousSize, nextSize)

		expect(after.zoom).toBe(before.zoom)
		expect((nextSize.width / 2 - after.pan.x) / after.zoom).toBeCloseTo(previousWorldCenter.x)
		expect((nextSize.height / 2 - after.pan.y) / after.zoom).toBeCloseTo(previousWorldCenter.y)
	})
})
