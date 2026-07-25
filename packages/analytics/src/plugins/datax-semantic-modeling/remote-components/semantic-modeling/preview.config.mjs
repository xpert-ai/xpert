import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(componentRoot, '../../../../../../..')

const dimensions = [
	dimension('Reseller', 'adv_reseller', ['Business Type', 'Reseller']),
	dimension('Customer', 'adv_customer', ['Customer']),
	dimension('Sales Territory', 'adv_sales_territory', ['Group', 'Country', 'Region']),
	dimension('Date', 'adv_date', ['Year', 'Month', 'Date']),
	dimension('Product', 'adv_product', ['sku', 'product', 'standard_cost', 'color']),
	dimension('Sales Order', 'adv_sales_order', ['Channel'])
]

const schema = {
	name: 'AdventureWorks Sales',
	dimensions,
	cubes: [
		{
			name: 'Sales',
			caption: 'Sales',
			fact: { type: 'table', table: { name: 'adv_sales' } },
			defaultMeasure: 'Sales Amount',
			measures: [
				{ name: 'Sales Quantity', column: 'sales_quantity', aggregator: 'sum' },
				{ name: 'Unit Price', column: 'unit_price', aggregator: 'avg' },
				{ name: 'Extended Amount', column: 'extended_amount', aggregator: 'sum' },
				{
					name: 'Sales Amount',
					caption: '销售金额',
					description: '销售金额（包含税前折扣）',
					column: 'sales_amount',
					datatype: 'Decimal',
					aggregator: 'sum',
					formatString: '#,##0.00'
				},
				{ name: 'Tax Amount', column: 'tax_amount', aggregator: 'sum' },
				{ name: 'Freight', column: 'freight', aggregator: 'sum' },
				{ name: 'Discount Amount', column: 'discount_amount', aggregator: 'sum' },
				{ name: 'Order Count', column: 'sales_order_id', aggregator: 'count' }
			],
			calculatedMembers: [{ name: 'Avg Unit Price', formula: '', visible: true }],
			dimensionUsages: dimensions.map((item) => ({
				name: item.name,
				source: item.name,
				foreignKey: `${item.name.toLowerCase().replaceAll(' ', '_')}_id`
			}))
		}
	],
	virtualCubes: [
		{
			name: 'Unified Commerce',
			caption: '统一商业分析',
			description: '统一销售渠道、客户与商品口径，用于跨主题经营分析。',
			cubeUsages: [{ cubeName: 'Sales', ignoreUnrelatedDimensions: false }],
			virtualCubeDimensions: [
				{ cubeName: 'Sales', name: 'Reseller', caption: '经销商', __shared__: true },
				{ cubeName: 'Sales', name: 'Date', caption: '日期', __shared__: true },
				{ cubeName: 'Sales', name: 'Product', caption: '商品', __shared__: true }
			],
			virtualCubeMeasures: [
				{ cubeName: 'Sales', name: 'Sales Amount', caption: '销售金额', visible: true },
				{ cubeName: 'Sales', name: 'Order Count', caption: '订单数', visible: true }
			],
			calculatedMembers: [
				{
					name: 'Average Order Value',
					caption: '平均订单金额',
					dimension: 'Measures',
					formula: '[Measures].[Sales Amount] / [Measures].[Order Count]',
					visible: true
				}
			]
		}
	],
	roles: []
}

const sourceTables = [
	'adv_reseller',
	'adv_customer',
	'adv_sales_territory',
	'adv_date',
	'adv_product',
	'adv_sales_order',
	'adv_sales'
]

const workspace = {
	item: {
		model: {
			id: 'model-1',
			name: 'Demo – AdventureWorks Sales',
			key: 'rshEYUmoSJ',
			type: 'SQL',
			status: 'draft',
			draftVersion: 18,
			cubeCount: 1,
			dimensionCount: dimensions.length,
			dataSourceName: 'warehouse_prod'
		},
		draft: { schema },
		checklist: []
	}
}

export default {
	title: 'Semantic Model Studio · Remote View Preview',
	frameTitle: 'Semantic Model Studio',
	workspaceRoot,
	instanceId: 'semantic-studio-preview',
	component: {
		root: componentRoot,
		runtime: 'react',
		title: 'Semantic Model Studio Preview'
	},
	hostContext: {
		manifest: { key: 'datax-semantic-modeling' },
		payload: {},
		initialQuery: {
			page: 1,
			pageSize: 50,
			parameters: { modelId: 'model-1' }
		},
		locale: 'zh-Hans',
		theme: {
			mode: 'light',
			tokens: {
				colorBackground: 'oklch(1 0 0)',
				colorForeground: 'oklch(0.21 0.006 285.885)',
				colorCard: 'oklch(1 0 0)',
				colorCardForeground: 'oklch(0.21 0.006 285.885)',
				colorPopover: 'oklch(1 0 0)',
				colorPopoverForeground: 'oklch(0.21 0.006 285.885)',
				colorMuted: 'oklch(0.967 0.001 286.375)',
				colorMutedForeground: 'oklch(0.552 0.016 285.938)',
				colorSecondary: 'oklch(0.967 0.001 286.375)',
				colorSecondaryForeground: 'oklch(0.21 0.006 285.885)',
				colorAccent: 'oklch(0.9619 0.0179 272.314)',
				colorAccentForeground: 'oklch(0.5106 0.2301 276.966)',
				colorBorder: 'oklch(0.92 0.004 286.32)',
				colorInput: 'oklch(0.92 0.004 286.32)',
				colorPrimary: 'oklch(0.21 0.006 285.885)',
				colorPrimaryForeground: 'oklch(0.985 0 0)',
				colorRing: 'oklch(0.705 0.015 286.067)',
				colorSuccess: 'oklch(0.596 0.145 163.225)',
				colorWarning: 'oklch(0.666 0.179 58.318)',
				radiusMd: '0.5rem',
				radiusLg: '0.625rem'
			}
		},
		debug: { enabled: false, production: true }
	},
	state: {
		workspace,
		sourceTables,
		modelOptions: [{ value: 'model-1', label: 'Demo – AdventureWorks Sales' }],
		dataSourceOptions: [{ value: 'source-1', label: 'warehouse_prod' }],
		catalogOptions: [{ value: 'demo', label: 'Demo warehouse' }],
		projectOptions: [{ value: 'project-1', label: 'Retail Analytics' }],
		version: 18
	},
	async handleRequest(message, { state }) {
		if (message.type === 'requestParameterOptions') {
			const items =
				message.parameterKey === 'dataSourceId'
					? state.dataSourceOptions
					: message.parameterKey === 'catalog'
						? state.catalogOptions
						: message.parameterKey === 'projectId'
							? state.projectOptions
							: state.modelOptions
			return {
				result: {
					items
				}
			}
		}

		if (message.type === 'requestData') {
			const parameters = message.query?.parameters ?? {}
			if (parameters.mode === 'tables') {
				return {
					data: {
						items: state.sourceTables,
						total: state.sourceTables.length
					}
				}
			}
			if (parameters.mode === 'table_schema') {
				return {
					data: {
						item: [
							{
								name: parameters.tableName,
								columns: [
									{ name: 'id', type: 'Integer', nullable: false },
									{ name: 'name', type: 'String', nullable: true },
									{ name: 'amount', type: 'Numeric', nullable: true }
								]
							}
						]
					}
				}
			}
			return { data: state.workspace }
		}

		if (message.type === 'executeAction') {
			if (message.actionKey === 'create_workspace') {
				const modelId = `model-${state.modelOptions.length + 1}`
				const name = message.input?.name || `Semantic Model ${state.modelOptions.length + 1}`
				const key = message.input?.key || modelId
				state.version = 1
				state.workspace = {
					item: {
						model: {
							id: modelId,
							name,
							key,
							type: message.input?.type || 'SQL',
							status: 'draft',
							draftVersion: state.version,
							cubeCount: 0,
							dimensionCount: 0,
							dataSourceName: state.dataSourceOptions[0]?.label,
							projectId: message.input?.projectId
						},
						draft: { schema: { name: key, dimensions: [], cubes: [], virtualCubes: [] } },
						checklist: []
					}
				}
				state.modelOptions.push({ value: modelId, label: name })
				return {
					result: {
						success: true,
						message: 'Preview semantic model created.',
						data: {
							id: modelId,
							name,
							key,
							draftVersion: state.version
						}
					}
				}
			}
			if (message.actionKey === 'save_draft' && typeof message.input?.schemaJson === 'string') {
				const nextSchema = JSON.parse(message.input.schemaJson)
				if (!nextSchema || typeof nextSchema !== 'object' || Array.isArray(nextSchema)) {
					throw new Error('Preview save_draft requires an object schema.')
				}
				state.workspace.item.draft.schema = nextSchema
			}
			if (message.actionKey === 'execute_query') {
				return {
					result: {
						success: true,
						message: 'Preview query completed.',
						data: {
							columns: [
								{ name: 'Reseller', type: 'String' },
								{ name: 'Sales Amount', type: 'Decimal' },
								{ name: 'Order Count', type: 'Integer' }
							],
							rows: [
								{ Reseller: 'Adventure Works', 'Sales Amount': 1287450.32, 'Order Count': 1842 },
								{ Reseller: 'Contoso', 'Sales Amount': 936210.75, 'Order Count': 1217 },
								{ Reseller: 'Northwind', 'Sales Amount': 602441.1, 'Order Count': 864 }
							],
							rowCount: 3,
							totalRowCount: 3,
							truncated: false,
							mdx: message.input?.statement,
							sql: 'SELECT reseller_name, SUM(sales_amount) AS sales_amount, COUNT(order_id) AS order_count\nFROM adv_sales\nGROUP BY reseller_name\nORDER BY sales_amount DESC',
							durationMs: 42
						}
					}
				}
			}
			if (message.actionKey === 'publish') {
				state.workspace.item.model.status = 'published'
				state.workspace.item.model.publishAt = new Date().toISOString()
			}
			state.version += 1
			state.workspace.item.model.draftVersion = state.version
			return {
				result: {
					success: true,
					message: 'Preview action completed.',
					modelId: 'model-1',
					version: state.version
				}
			}
		}

		throw new Error(`Unsupported Semantic Model Studio preview request '${message.type}'.`)
	}
}

function dimension(name, table, levels) {
	return {
		name,
		caption: name,
		hierarchies: [
			{
				name,
				caption: name,
				hasAll: true,
				primaryKey: 'id',
				tables: [{ name: table }],
				levels: levels.map((level) => ({
					name: level,
					caption: level,
					column: level.toLowerCase().replaceAll(' ', '_'),
					type: 'String',
					levelType: 'Regular',
					uniqueMembers: true
				}))
			}
		]
	}
}
