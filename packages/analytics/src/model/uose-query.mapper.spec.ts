import { C_MEASURES, CalculationType, FilterOperator, TimeLevelType } from '@xpert-ai/ocap-core'
import type { Schema } from '@xpert-ai/ocap-core'
import { buildOcapQueryFromUose, normalizeUoseQueryResponse, UoseMdxQueryRequest } from './uose-query.mapper'

describe('uose-query.mapper', () => {
	const salesSchema: Schema = {
		name: 'Demo',
		cubes: [
			{
				name: 'Sales',
				dimensionUsages: [
					{
						name: 'Order Date',
						source: 'Date',
						foreignKey: 'order_date_key'
					}
				]
			}
		],
		dimensions: [
			{
				name: 'Date',
				type: 'TimeDimension',
				hierarchies: [
					{
						name: 'Date',
						levels: [
							{
								name: 'Year',
								levelType: TimeLevelType.TimeYears,
								semantics: {
									formatter: '[yyyy]'
								}
							},
							{
								name: 'Month',
								levelType: TimeLevelType.TimeMonths,
								semantics: {
									formatter: '[yyyy].[yyyyMM]'
								}
							}
						]
					}
				]
			}
		]
	}

	const baseRequest: UoseMdxQueryRequest = {
		context: {
			traceId: 'trace-1',
			taskId: 'task-1',
			principalId: 'user-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			requestedAt: '2026-03-22T08:00:00.000Z'
		},
		modelId: 'model-1',
		cubeName: 'Sales',
		metrics: [{ metricId: 'Revenue', level: 'raw' }],
		dimensions: [{ dimensionId: '[Time Calendar]', level: '[Time Calendar].[Month]' }],
		filters: [
			{ field: 'Region', op: 'in', value: ['East', 'West'] },
			{ field: 'Amount', op: 'between', value: [10, 20] }
		],
		timeWindow: {
			from: '2026-03-01',
			to: '2026-03-31'
		},
		limit: 50
	}

	it('maps standard UOSE DSL to OCAP QueryOptions', () => {
		const query = buildOcapQueryFromUose(baseRequest)

		expect(query).toMatchObject({
			cube: 'Sales',
			rows: [
				{
					dimension: '[Time Calendar]',
					hierarchy: '[Time Calendar]',
					level: '[Time Calendar].[Month]'
				}
			],
			columns: [
				{
					dimension: C_MEASURES,
					measure: 'Revenue'
				}
			],
			paging: {
				top: 50
			}
		})
		expect(query.filters).toEqual([
			{
				dimension: {
					dimension: 'Region',
					hierarchy: 'Region'
				},
				operator: FilterOperator.EQ,
				members: [{ key: 'East' }, { key: 'West' }]
			},
			{
				dimension: {
					dimension: 'Amount',
					hierarchy: 'Amount'
				},
				operator: FilterOperator.BT,
				members: [{ key: '10' }, { key: '20' }]
			},
			{
				dimension: {
					dimension: '[Time Calendar]',
					hierarchy: '[Time Calendar]',
					level: '[Time Calendar].[Month]'
				},
				operator: FilterOperator.BT,
				members: [{ key: '2026-03-01' }, { key: '2026-03-31' }]
			}
		])
	})

	it('passes native DSL through with a cube default', () => {
		const query = buildOcapQueryFromUose({
			...baseRequest,
			queryMode: 'native_dsl',
			nativeQuery: {
				rows: [{ dimension: 'Region' }]
			}
		})

		expect(query).toEqual({
			cube: 'Sales',
			rows: [{ dimension: 'Region' }]
		})
	})

	it('normalizes semantic date dimensions and time window members from schema', () => {
		const query = buildOcapQueryFromUose(
			{
				...baseRequest,
				dimensions: [{ dimensionId: 'Order Date', level: 'month' }],
				filters: [],
				timeWindow: {
					from: '2024-01-01',
					to: '2024-12-31'
				}
			},
			salesSchema
		)

		expect(query.rows).toEqual([
			{
				dimension: '[Order Date]',
				hierarchy: '[Order Date]',
				level: 'Month'
			}
		])
		expect(query.filters).toEqual([
			{
				dimension: {
					dimension: '[Order Date]',
					hierarchy: '[Order Date]',
					level: 'Month'
				},
				operator: FilterOperator.BT,
				members: [{ key: '[2024].[202401]' }, { key: '[2024].[202412]' }]
			}
		])
	})

	it('passes calculated measures and uses timeDimension for time window filters', () => {
		const query = buildOcapQueryFromUose(
			{
				...baseRequest,
				metrics: [{ metricId: 'Sales Amount Plus 10%', level: 'raw' }],
				dimensions: [{ dimensionId: 'Region' }],
				timeDimension: { dimensionId: 'Order Date', level: 'month' },
				filters: [],
				timeWindow: {
					from: '2024-01-01',
					to: '2024-12-31'
				},
				calculatedMeasures: [
					{
						name: 'Sales Amount Plus 10%',
						caption: 'Sales Amount Plus 10%',
						formula: '[Measures].[Sales Amount] * 1.1',
						dimension: 'Measures',
						calculationType: 'Calculated',
						formatString: 'Currency'
					}
				]
			},
			salesSchema
		)

		expect(query.rows).toEqual([
			{
				dimension: 'Region',
				hierarchy: 'Region',
				level: undefined
			}
		])
		expect(query.columns).toEqual([
			{
				dimension: C_MEASURES,
				measure: 'Sales Amount Plus 10%'
			}
		])
		expect(query.filters).toEqual([
			{
				dimension: {
					dimension: '[Order Date]',
					hierarchy: '[Order Date]',
					level: 'Month'
				},
				operator: FilterOperator.BT,
				members: [{ key: '[2024].[202401]' }, { key: '[2024].[202412]' }]
			}
		])
		expect(query.calculatedMeasures).toEqual([
			{
				name: 'Sales Amount Plus 10%',
				caption: 'Sales Amount Plus 10%',
				formula: '[Measures].[Sales Amount] * 1.1',
				dimension: C_MEASURES,
				calculationType: CalculationType.Calculated,
				properties: [
					{
						name: 'FORMAT_STRING',
						value: 'Currency'
					}
				]
			}
		])
	})

	it('rejects full MDX statements in calculated measure formulas', () => {
		expect(() =>
			buildOcapQueryFromUose({
				...baseRequest,
				metrics: [{ metricId: 'Unsafe', level: 'raw' }],
				calculatedMeasures: [
					{
						name: 'Unsafe',
						formula: 'SELECT [Measures].[Revenue] ON COLUMNS FROM [Sales]'
					}
				]
			})
		).toThrow(/formula fragment/)
	})

	it('normalizes OCAP QueryReturn to UOSE response', () => {
		const response = normalizeUoseQueryResponse(
			baseRequest,
			{
				data: {
					data: [{ '[Time Calendar]': '2026-03', Revenue: 100 }],
					schema: {
						columns: [{ name: 'Revenue', dataType: 'number' }]
					},
					stats: {
						statements: ['SELECT ...']
					}
				}
			},
			12
		)

		expect(response).toMatchObject({
			columns: [
				{ name: '[Time Calendar]', type: 'string' },
				{ name: 'Revenue', type: 'number' }
			],
			rows: [{ '[Time Calendar]': '2026-03', Revenue: 100 }],
			rowCount: 1,
			mdx: 'SELECT ...',
			appliedMetricVersions: [{ metricId: 'Revenue', metricVersion: 'latest' }],
			audit: {
				traceId: 'trace-1',
				taskId: 'task-1',
				principalId: 'user-1',
				modelId: 'model-1',
				cubeName: 'Sales',
				metricRefs: ['Revenue'],
				durationMs: 12,
				rowCount: 1
			}
		})
	})
})
