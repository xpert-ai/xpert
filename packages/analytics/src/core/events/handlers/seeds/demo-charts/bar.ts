import { Employee } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { Story, StoryPoint, StoryWidget } from '../../../../entities/internal'
import { createWidget } from '../common'
import { ENTITY_INVENTORY, ENTITY_SALES, SEMANTIC_MODEL_NAME } from '../semantic-model'

const pageName = 'Bar'
export const pageOptions = {
	key: '17fa50f6-bc95-440b-bfdd-cb74c8a87b61',
	type: 1,
	index: 1,
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

export async function createBarPage(
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

	await createWidget(storyWidgetRepository, page, 'Grouped Bar', {
		key: 'de1c9b30-da13-4c64-a4fd-aca324532d6d',
		component: 'AnalyticalCard',
		dataSettings: {
			chartAnnotation: {
				dimensions: [
					{
						dimension: '[Time]',
						hierarchy: '[Time]',
						level: '[Time].[Year]',
						displayBehaviour: 'descriptionOnly',
						zeroSuppression: true
					},
					{
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store Country]',
						role: 'Group',
						displayBehaviour: 'descriptionOnly',
					},
				],
				measures: [
					{
						dimension: 'Measures',
						measure: 'sales',
						formatting: {
							shortNumber: true,
							decimal: null,
							unit: null,
							useUnderlyingUnit: null,
						},
						palette: { name: 'Rainbow' },
						role: null,
					},
				],
				chartType: { type: 'Bar' },
			},
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_INVENTORY,
		},
		position: { x: 0, y: 0, rows: 13, cols: 20 },
		chartSettings: {},
		chartOptions: {
			categoryAxis: null,
			valueAxis: null,
			grid: null,
			seriesStyle: {
				barWidth: null,
				barMaxWidth: 50,
				barMinWidth: null,
				barMinHeight: null,
				barMinAngle: null,
				barGap: null,
				barCategoryGap: null,
				itemStyle: { borderWidth: 3, borderColor: 'black', borderRadius: 5 },
				universalTransition: false,
			},
			dataZoom: {
				type: 'inside',
				filterMode: null,
				startValue: null,
				endValue: null,
				yAxisIndex: null,
			},
			aria: {
				decal: {
					show: true,
					decals: [
						{
							symbol: 'circle',
							dashArrayX: [
								[8, 8],
								[0, 8, 8, 0],
							],
							dashArrayY: [6, 0],
							symbolSize: 0.5,
							color: 'black',
						},
						{ dashArrayY: [2, 5], rotation: 0.5, color: 'black' },
						{
							symbol: 'circle',
							dashArrayX: [
								[8, 8],
								[0, 8, 8, 0],
							],
							dashArrayY: [6, 0],
							symbolSize: 0.5,
							color: 'black',
						},
					],
				},
				enabled: true,
			},
			colors: { color: ['white', '#ffab00', '#455a64'] },
			tooltip: {
				show: null,
				showContent: null,
				trigger: 'item',
				appendToBody: null,
			},
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Grouped Bar',
		fullscreen: false,
	})

	await createWidget(storyWidgetRepository, page, 'Stacked Bar', {
		key: '0a2d0edb-9b74-4b95-a438-d3a905cf15ea',
		component: 'AnalyticalCard',
		dataSettings: {
			chartAnnotation: {
				dimensions: [
					{ dimension: '[Time]', hierarchy: '[Time]', level: '[Time].[Year]',
					zeroSuppression: true },
					{
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store Country]',
						role: 'Stacked',
						displayBehaviour: 'descriptionOnly',
					},
				],
				measures: [
					{
						dimension: 'Measures',
						measure: 'sales',
						formatting: {
							shortNumber: true,
							decimal: null,
							unit: null,
							useUnderlyingUnit: null,
						},
						palette: { name: 'Rainbow' },
						role: null,
					},
				],
				chartType: { type: 'Bar' },
			},
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_INVENTORY,
		},
		position: { x: 20, y: 0, rows: 13, cols: 20 },
		chartSettings: {},
		chartOptions: {
			categoryAxis: null,
			valueAxis: null,
			grid: null,
			seriesStyle: {
				barWidth: null,
				barMaxWidth: 50,
				barMinWidth: null,
				barMinHeight: null,
				barMinAngle: null,
				barGap: null,
				barCategoryGap: null,
				itemStyle: { borderWidth: 3, borderColor: 'black', borderRadius: 5 },
			},
			dataZoom: {
				type: 'inside',
				filterMode: null,
				startValue: null,
				endValue: null,
				yAxisIndex: null,
			},
			aria: {
				decal: {
					show: true,
					decals: [
						{
							symbol: 'circle',
							dashArrayX: [
								[8, 8],
								[0, 8, 8, 0],
							],
							dashArrayY: [6, 0],
							symbolSize: 0.5,
							color: 'black',
						},
						{ dashArrayY: [2, 5], rotation: 0.5, color: 'black' },
						{
							symbol: 'circle',
							dashArrayX: [
								[8, 8],
								[0, 8, 8, 0],
							],
							dashArrayY: [6, 0],
							symbolSize: 0.5,
							color: 'black',
						},
					],
				},
				enabled: true,
			},
			colors: null,
			tooltip: {
				show: null,
				showContent: null,
				trigger: 'axis',
				appendToBody: null,
			},
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Stacked Bar',
		fullscreen: false,
	})

	await createWidget(storyWidgetRepository, page, 'Combination Chart', {
		key: 'd59a501f-2dbb-4967-985e-c3a4b7ba9ec5',
		component: 'AnalyticalCard',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
			chartAnnotation: {
				dimensions: [
					{
						name: null,
						dimension: '[Time]',
						hierarchy: '[Time]',
						level: '[Time].[Quarter]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: true,
						formatting: null,
						parameter: null,
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
						parameter: null,
						measure: 'Profit',
						palette: { name: 'PiYG' },
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
						parameter: null,
						measure: 'Profit Growth',
						role: 'Axis2',
						shapeType: 'line',
					},
				],
				chartType: { type: 'Bar' },
			},
		},
		position: { x: 0, y: 13, rows: 13, cols: 20 },
		chartSettings: {},
		chartOptions: {
			tooltip: null,
			legend: null,
			dataZoom: null,
			colors: null,
			aria: null,
			categoryAxis: null,
			valueAxis: null,
			grid: null,
			seriesStyle: null,
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Combination Chart',
	})
}
