import { Employee } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { Story, StoryPoint, StoryWidget } from '../../../../entities/internal'
import { ENTITY_SALES, SEMANTIC_MODEL_NAME } from '../semantic-model'
import { createWidget } from '../common'

const pageName = 'Scatter'
export const pageOptions = {
	key: 'f09f1ee7-d160-42ff-a701-38c2e9cfc0fc',
	type: 1,
	index: 3,
	responsive: null,
	gridOptions: {
		gridType: 'fixed',
		setGridSize: true,
		fixedColWidth: 15,
		fixedRowHeight: 15,
	},
	filterBar: null,
	styling: { canvas: {}, pageSize: {} },
	fullscreen: false,
}

export async function createScatterPage(
	employee: Employee,
	story: Story,
	storyPageRepository: Repository<StoryPoint>,
	storyWidgetRepository: Repository<StoryWidget>
) {
	let page = new StoryPoint()
	page.tenantId = employee.tenantId
	page.createdById = employee.userId
	page.organizationId = employee.organizationId
	page.storyId = story.id
	page.name = pageName
	page.options = pageOptions
	page = await storyPageRepository.save(page)

	await createWidget(storyWidgetRepository, page, 'Scatter', {
		key: '8bc9ede2-88ed-47de-82a3-a5417b495daa',
		component: 'AnalyticalCard',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
			chartAnnotation: {
				dimensions: [
					{
						dimension: '[Product]',
						hierarchy: '[Product]',
						level: '[Product].[Brand Name]',
					},
				],
				measures: [
					{ dimension: 'Measures', measure: 'Cost' },
					{
						dimension: 'Measures',
						measure: 'Sales',
						formatting: {
							shortNumber: true,
							decimal: null,
							unit: null,
							useUnderlyingUnit: null,
						},
					},
					{
						dimension: 'Measures',
						measure: 'Product Quantity',
						formatting: {
							shortNumber: true,
							decimal: null,
							unit: null,
							useUnderlyingUnit: null,
						},
						role: 'Lightness',
					},
				],
				chartType: { type: 'Scatter' },
			},
		},
		position: { x: 0, y: 0, rows: 14, cols: 20 },
		chartSettings: {},
		chartOptions: {
			tooltip: null,
			colors: null,
			legend: null,
			aria: null,
			dataZoom: {
				type: 'inside',
				filterMode: null,
				startValue: null,
				endValue: null,
				yAxisIndex: null,
			},
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Scatter',
	})

	await createWidget(storyWidgetRepository, page, 'Radial Scatter', {
		key: '3f5fe41d-7adc-404e-822c-b4645c190417',
		component: 'AnalyticalCard',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
			chartAnnotation: {
				dimensions: [
					{
						dimension: '[Product]',
						hierarchy: '[Product]',
						level: '[Product].[Brand Name]',
						members: [
							{ value: '[ADJ]', label: 'ADJ' },
							{ value: '[Akron]', label: 'Akron' },
							{ value: '[American]', label: 'American' },
							{ value: '[Amigo]', label: 'Amigo' },
							{ value: '[Applause]', label: 'Applause' },
						],
						role: 'Category2',
					},
					{
						dimension: '[Time]',
						hierarchy: '[Time]',
						level: '[Time].[Month]',
						role: null,
					},
				],
				measures: [{ dimension: 'Measures', measure: 'Cost', role: 'Size' }],
				chartType: { type: 'RadialScatter' },
			},
			selectionVariant: {
				selectOptions: [
					{
						dimension: { dimension: '[Time]', hierarchy: '[Time]' },
						hierarchy: '[Time]',
						currentDate: 'TODAY',
						ranges: [
							{
								type: 'Standard',
								granularity: 'Year',
								current: { direction: null, granularity: null, amount: null },
								lookBack: 1,
								lookAhead: -1,
							},
						],
						allowModifySelections: null,
						selctionType: null,
					},
				],
			},
		},
		position: { x: 20, y: 0, rows: 14, cols: 20 },
		chartSettings: {},
		chartOptions: {
			tooltip: null,
			legend: null,
			dataZoom: {
				type: null,
				filterMode: null,
				startValue: null,
				endValue: null,
				yAxisIndex: null,
			},
			colors: null,
			aria: null,
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		fullscreen: false,
		title: 'Radial Scatter',
	})
}
