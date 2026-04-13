import { Employee } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { Story, StoryPoint, StoryWidget } from '../../../../entities/internal'
import { ENTITY_SALES, SEMANTIC_MODEL_NAME } from '../semantic-model'
import { createWidget } from '../common'

const pageName = 'Distribution'
export const pageOptions = {
	key: '5cf7496b-a4ec-4e14-b1c0-a9a3425e248e',
	type: 1,
	index: 4,
	responsive: null,
	gridOptions: {
		gridType: 'fixed',
		setGridSize: true,
		fixedColWidth: 15,
		fixedRowHeight: 15,
	},
	filterBar: null,
	styling: { canvas: {}, pageSize: {} },
}

export async function createDistributionPage(
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

	await createWidget(storyWidgetRepository, page, 'Sankey', {
		key: '680f71d6-b36d-422f-a708-6cb9e34246e6',
		component: 'AnalyticalCard',
		dataSettings: {
			chartAnnotation: {
				dimensions: [
					{
						name: null,
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store State]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: true,
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
						formatting: null,
						measure: 'Cost',
					},
				],
				chartType: {type: 'Sankey'},
			},
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
		},
		position: { x: 0, y: 0, rows: 16, cols: 19 },
		chartSettings: {},
		chartOptions: {},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Sankey',
	})

	await createWidget(storyWidgetRepository, page, 'Tree Map', {
		key: '3bc1cf71-ad29-4c74-8da9-1b37780e42c4',
		component: 'AnalyticalCard',
		dataSettings: {
			chartAnnotation: {
				dimensions: [
					{
						name: null,
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store State]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: true,
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
						formatting: null,
						measure: 'Cost',
					},
				],
				chartType: { type: 'Treemap' },
			},
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
		},
		position: { x: 34, y: 0, rows: 16, cols: 17 },
		chartSettings: {},
		chartOptions: {},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Tree Map',
	})

	await createWidget(storyWidgetRepository, page, 'Tree', {
		key: '215ac618-3d5a-4355-9910-b6b207157552',
		component: 'AnalyticalCard',
		dataSettings: {
			chartAnnotation: {
				dimensions: [
					{
						name: null,
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store State]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: true,
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
						formatting: null,
						measure: 'Cost',
					},
				],
				chartType: { type: 'Tree' },
			},
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
		},
		position: { x: 19, y: 0, rows: 16, cols: 15 },
		chartSettings: {},
		chartOptions: { seriesStyle: null },
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Tree',
	})

	await createWidget(storyWidgetRepository, page, 'Sunburst', {
		key: '1086d004-2fc9-4aa2-8636-85de01f68e31',
		component: 'AnalyticalCard',
		dataSettings: {
			chartAnnotation: {
				dimensions: [
					{
						name: null,
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store State]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: true,
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
						formatting: null,
						measure: 'Cost',
					},
				],
				chartType: { type: 'Sunburst' },
			},
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
		},
		position: { x: 0, y: 16, rows: 17, cols: 19 },
		chartSettings: {},
		chartOptions: { seriesStyle: null },
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Sunburst',
	})
}
