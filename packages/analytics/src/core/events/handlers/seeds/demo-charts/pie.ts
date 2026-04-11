import { Employee } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { Story, StoryPoint, StoryWidget } from '../../../../entities/internal'
import { createWidget } from '../common'
import { ENTITY_SALES, SEMANTIC_MODEL_NAME } from '../semantic-model'

const pageName = 'Pie'
export const pageOptions = {
	key: '80105925-0f9b-4731-a031-1f653b4da132',
	type: 1,
	index: 2,
	responsive: null,
	gridOptions: {
		gridType: 'fixed',
		setGridSize: true,
		fixedColWidth: 15,
		fixedRowHeight: 15
	},
	filterBar: null,
	styling: { canvas: {}, pageSize: {} },
	fullscreen: false
}

export async function createPiePage(
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

	await createWidget(storyWidgetRepository, page, 'Pie', {
		key: 'e2ffe6a4-cc22-441d-8f54-16671115051c',
		component: 'AnalyticalCard',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
			chartAnnotation: {
				dimensions: [
					{
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store Country]'
					}
				],
				measures: [{ dimension: 'Measures', measure: 'Cost' }],
				chartType: { type: 'Pie' }
			},
			presentationVariant: {
				sortOrder: [{ by: 'Cost', order: 'DESC' }],
				groupBy: []
			}
		},
		position: { x: 0, y: 0, rows: 16, cols: 15 },
		chartSettings: {},
		chartOptions: {
			tooltip: null,
			colors: null,
			legend: {
				show: true,
				type: 'scroll',
				width: 30,
				height: null,
				left: null,
				top: null,
				right: null,
				bottom: null,
				orient: 'vertical',
				align: null
			},
			seriesStyle: {
				itemStyle: { borderWidth: 2, borderColor: 'black', borderRadius: 10 },
				universalTransition: null
			},
			aria: {
				decal: {
					show: true,
					decals: [
						{
							dashArrayX: [1, 0],
							dashArrayY: [2, 5],
							symbolSize: 1,
							rotation: 0.52,
							symbol: 'rect'
						},
						{
							dashArrayX: [
								[8, 8],
								[0, 8, 8, 0]
							],
							dashArrayY: [6, 0],
							symbolSize: 1,
							symbol: 'circle'
						},
						{
							dashArrayX: [1, 0],
							dashArrayY: [4, 3],
							symbolSize: 1,
							rotation: -0.78,
							symbol: 'rect'
						},
						{
							dashArrayX: [
								[6, 7],
								[0, 6, 6, 0]
							],
							dashArrayY: [6, 0],
							symbolSize: 1,
							symbol: 'rect'
						}
					]
				},
				enabled: true
			}
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Pie'
	})

	await createWidget(storyWidgetRepository, page, 'Doughnut', {
		key: 'ae4554af-f7f1-4216-98fb-950fcceb26fb',
		component: 'AnalyticalCard',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
			chartAnnotation: {
				dimensions: [
					{
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store Country]'
					}
				],
				measures: [{ dimension: 'Measures', measure: 'Cost' }],
				chartType: { type: 'Pie', variant: 'Doughnut' }
			},
			presentationVariant: {
				sortOrder: [{ by: 'Cost', order: 'DESC' }],
				groupBy: []
			}
		},
		position: { x: 15, y: 0, rows: 16, cols: 15 },
		chartSettings: {},
		chartOptions: {
			tooltip: null,
			colors: null,
			legend: {
				show: true,
				type: 'scroll',
				width: 30,
				height: null,
				left: null,
				top: null,
				right: null,
				bottom: null,
				orient: 'vertical',
				align: null
			},
			seriesStyle: {
				itemStyle: { borderWidth: null, borderColor: null, borderRadius: 10 },
				universalTransition: null
			},
			aria: {
				enabled: true,
				decal: {
					show: true,
					decals: [
						{
							dashArrayX: [1, 0],
							dashArrayY: [2, 5],
							symbolSize: 1,
							rotation: 0.52,
							symbol: 'rect'
						},
						{
							dashArrayX: [
								[8, 8],
								[0, 8, 8, 0]
							],
							dashArrayY: [6, 0],
							symbolSize: 1,
							symbol: 'circle'
						},
						{
							dashArrayX: [1, 0],
							dashArrayY: [4, 3],
							symbolSize: 1,
							rotation: -0.78,
							symbol: 'rect'
						},
						{
							dashArrayX: [
								[6, 7],
								[0, 6, 6, 0]
							],
							dashArrayY: [6, 0],
							symbolSize: 1,
							symbol: 'rect'
						}
					]
				}
			}
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Doughnut'
	})

	await createWidget(storyWidgetRepository, page, 'Nightingale Chart', {
		key: 'ecf58cd9-0a6a-47ef-a6af-acf6b1086273',
		component: 'AnalyticalCard',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
			chartAnnotation: {
				dimensions: [
					{
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store Country]'
					}
				],
				measures: [{ dimension: 'Measures', measure: 'Cost' }],
				chartType: { type: 'Pie', variant: 'Nightingale' }
			},
			presentationVariant: {
				sortOrder: [{ by: 'Cost', order: 'DESC' }],
				groupBy: []
			}
		},
		position: { x: 30, y: 0, rows: 16, cols: 15 },
		chartSettings: {},
		chartOptions: {
			tooltip: null,
			colors: null,
			legend: {
				show: true,
				type: 'scroll',
				width: 30,
				height: null,
				left: null,
				top: null,
				right: null,
				bottom: null,
				orient: 'vertical',
				align: null
			},
			seriesStyle: {
				itemStyle: { borderWidth: null, borderColor: null, borderRadius: 10 },
				universalTransition: null,
				roseType: 'area'
			},
			aria: {
				enabled: false,
				decal: {
					show: true,
					decals: [
						{
							dashArrayX: [1, 0],
							dashArrayY: [2, 5],
							symbolSize: 1,
							rotation: 0.52,
							symbol: 'rect'
						},
						{
							dashArrayX: [
								[8, 8],
								[0, 8, 8, 0]
							],
							dashArrayY: [6, 0],
							symbolSize: 1,
							symbol: 'circle'
						},
						{
							dashArrayX: [1, 0],
							dashArrayY: [4, 3],
							symbolSize: 1,
							rotation: -0.78,
							symbol: 'rect'
						},
						{
							dashArrayX: [
								[6, 7],
								[0, 6, 6, 0]
							],
							dashArrayY: [6, 0],
							symbolSize: 1,
							symbol: 'rect'
						}
					]
				}
			}
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
		title: 'Nightingale Chart'
	})
}
