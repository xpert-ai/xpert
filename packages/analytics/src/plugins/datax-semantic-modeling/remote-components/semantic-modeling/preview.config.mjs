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
			measures: [
				{ name: 'Sales Quantity', column: 'sales_quantity', aggregator: 'sum' },
				{ name: 'Unit Price', column: 'unit_price', aggregator: 'avg' },
				{ name: 'Extended Amount', column: 'extended_amount', aggregator: 'sum' },
				{ name: 'Unit Price Discount pct', column: 'discount_pct', aggregator: 'avg' }
			],
			dimensionUsages: dimensions.map((item) => ({
				name: item.name,
				source: item.name,
				foreignKey: `${item.name.toLowerCase().replaceAll(' ', '_')}_id`
			}))
		}
	],
	virtualCubes: [],
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
		version: 18
	},
	async handleRequest(message, { state }) {
		if (message.type === 'requestParameterOptions') {
			return {
				result: {
					items: message.parameterKey === 'dataSourceId' ? state.dataSourceOptions : state.modelOptions
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
						items: [
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
				tables: [{ name: table }],
				levels: levels.map((level) => ({
					name: level,
					column: level.toLowerCase().replaceAll(' ', '_')
				}))
			}
		]
	}
}
