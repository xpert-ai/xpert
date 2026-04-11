import { Employee } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { Story, StoryPoint, StoryWidget } from '../../../../entities/internal'
import { ENTITY_SALES, SEMANTIC_MODEL_NAME } from '../semantic-model'
import { createWidget } from '../common'

const pageName = 'Line'
export const pageOptions = {
	key: 'ca72323f-a9aa-471b-9b1b-b0755e1fc909',
	type: 1,
	index: 0,
	responsive: null,
	gridOptions: {
		gridType: 'fixed',
		setGridSize: true,
		fixedColWidth: 15,
		fixedRowHeight: 15,
		minCols: 40,
		minRows: 20
	},
	filterBar: null,
	styling: { canvas: {}, pageSize: {} },
}

export async function createLinePage(
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

    await createWidget(storyWidgetRepository, page, 'Basic Line Chart', {
		key: '5af479ec-410a-4803-a273-bd6b8413cce8',
		component: 'AnalyticalCard',
		dataSettings: {
			chartAnnotation: {
				dimensions: [
					{
						name: null,
						dimension: '[Time]',
						hierarchy: '[Time]',
						level: '[Time].[Month]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: true,
						formatting: null,
					},
				],
				measures: [
					{
						name: null,
						dimension: 'Measures',
						hierarchy: null,
						level: null,
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: {
							shortNumber: true,
							decimal: null,
							unit: null,
							useUnderlyingUnit: null,
						},
						measure: 'Sales',
						role: 'Axis1',
						palette: { name: 'BrBG' },
					},
				],
				chartType: {type: 'Line'},
			},
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
		},
		position: { x: 0, y: 0, rows: 16, cols: 20 },
		chartSettings: {},
		chartOptions: {},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Basic Line Chart',
	})

	await createWidget(storyWidgetRepository, page, 'Dual Axis Line Chart', {
		key: '9b904a59-4442-4959-8474-50b1410bafb0',
		component: 'AnalyticalCard',
		dataSettings: {
			chartAnnotation: {
				dimensions: [
					{
						name: null,
						dimension: '[Time]',
						hierarchy: '[Time]',
						level: '[Time].[Month]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: true,
						formatting: null,
					},
				],
				measures: [
					{
						name: null,
						dimension: 'Measures',
						hierarchy: null,
						level: null,
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: {
							shortNumber: true,
							decimal: 0,
							unit: '元',
							useUnderlyingUnit: null,
						},
						measure: 'Sales',
					},
					{
						name: null,
						dimension: 'Measures',
						hierarchy: null,
						level: null,
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: {
							shortNumber: true,
							decimal: 0,
							unit: null,
							useUnderlyingUnit: null,
						},
						measure: 'Cost',
					},
					{
						name: null,
						dimension: 'Measures',
						hierarchy: null,
						level: null,
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: {
							shortNumber: null,
							decimal: null,
							unit: '%',
							useUnderlyingUnit: null,
						},
						measure: 'Profit Growth',
						role: 'Axis2',
					},
				],
				chartType: {type: 'Line'},
			},
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
		},
		position: { x: 20, y: 0, rows: 16, cols: 20 },
		chartSettings: {},
		chartOptions: {},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Dual Axis Line Chart',
	})
	
}
