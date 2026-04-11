import { Employee } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { SemanticModel, Story, StoryPoint, StoryWidget } from '../../../../entities/internal'
import { createWidget } from '../common'

export const STORY_NAME = 'Demo - Calculation'
export const STORY_OPTIONS = {
	options: {},
	schema: {
		name: null,
		entitySets: {
			Sales: {
				name: 'Sales',
				entityType: {
					name: 'Sales',
					properties: {
						Sales_MA: {
							__id__: '7a615c8d-d63c-4654-9966-8cfef255b664',
							name: 'Sales_MA',
							formula: 'AVG(LastPeriods([@Sales_MA_Periods], [Time].CurrentMember), [Measures].[Sales])',
							calculationType: 'Calculated',
							role: 'measure',
							dataType: 'number'
						},
						Sales_MA_Forward: {
							__id__: '5970381c-7e46-4db0-a97c-0f7b0011fa5a',
							calculationType: 'Calculated',
							name: 'Sales_MA_Forward',
							formula: 'AVG(LastPeriods(-[@Sales_MA_Periods], [Time].CurrentMember), [Measures].[Sales])',
							role: 'measure',
							dataType: 'number'
						},
						Sales_MA_Back_Forward: {
							__id__: '91777a9a-819f-4389-8b82-8b6e50b872df',
							calculationType: 'Calculated',
							name: 'Sales_MA_Back_Forward',
							formula:
								'AVG({LastPeriods([@Sales_MA_Periods], [Time].CurrentMember), LastPeriods(-[@Sales_MA_Periods], [Time].CurrentMember)}, [Measures].[Sales])',
							role: 'measure',
							dataType: 'number'
						},
						Sales_MA_Start: {
							__id__: 'f13c4b25-8565-4a92-b3f8-e964eb67a58a',
							name: 'Sales_MA_Start',
							formula: 'LastPeriods([@Sales_MA_Periods], [Time].CurrentMember).Item(0).Caption',
							calculationType: 'Calculated',
							role: 'measure',
							dataType: 'number'
						}
					},
					parameters: {
						Sales_MA_Periods: {
							__id__: '57eb6a0d-b20b-4544-9f94-892cda4664e2',
							name: 'Sales_MA_Periods',
							label: null,
							dimension: null,
							hierarchy: null,
							paramType: 0,
							value: '3',
							members: [],
							availableMembers: []
						}
					}
				}
			}
		}
	},
	filterBar: {
		opened: false,
		dataSettings: {
			selectionFieldsAnnotation: { propertyPaths: [] },
			dataSource: 'Demo - FoodMart Model',
			entitySet: 'Sales'
		},
		options: {
			today: { enable: true, granularity: 'Month', granularitySequence: '1', defaultValue: '2021-12-01' },
			liveMode: true
		},
		styling: { widget: { 'background-color': '' } }
	}
}

export const page1Name = 'Moving Average'
export const page1Options = {
	type: 1,
	key: '6d65e243-3b57-4cb5-b701-b85e185c0dfd',
	index: 0,
	responsive: null,
	gridOptions: {
		gridType: 'fixed',
		setGridSize: true,
		fixedColWidth: 50,
		fixedRowHeight: 50,
		minCols: 20,
		minRows: 10,
		displayGrid: 'always'
	},
	filterBar: null,
	fullscreen: false
}

export async function createDemoCalculationStory(
	employee: Employee,
	semanticModel: SemanticModel,
	storyRepository: Repository<Story>,
	storyPageRepository: Repository<StoryPoint>,
	storyWidgetRepository: Repository<StoryWidget>
) {
	let story = new Story()
	story.tenantId = employee.tenantId
	story.createdById = employee.userId
	story.organizationId = employee.organizationId
	story.businessAreaId = semanticModel.businessAreaId
	story.modelId = semanticModel.id
	story.name = STORY_NAME
	story.options = STORY_OPTIONS
	story = await storyRepository.save(story)

	let page1 = new StoryPoint()
	page1.tenantId = employee.tenantId
	page1.createdById = employee.userId
	page1.organizationId = employee.organizationId
	page1.storyId = story.id
	page1.name = page1Name
	page1.options = page1Options
	page1 = await storyPageRepository.save(page1)

	await createWidget(storyWidgetRepository, page1, '客户', {
		key: '4691bd1c-4b87-4880-b61b-29c3ac4e76e4',
		styling: {
			layer: { rows: 16, cols: 15, x: 0, y: 4 },
			widget: { 'background-color': '' },
			displayDensity: 'compact',
			appearance: 'outline'
		},
		component: 'InputControl',
		title: '客户',
		dataSettings: { dataSource: 'Demo - FoodMart Model', entitySet: 'Sales' },
		options: {
			typeAhead: {},
			dimension: {
				name: null,
				dimension: '[Customers]',
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
				parameter: null
			},
			searchable: true,
			selctionType: 'Multiple',
			presentation: 1,
			initialLevel: 2
		},
		position: { x: 0, y: 2, cols: 5, rows: 8 }
	})

	await createWidget(storyWidgetRepository, page1, '移动平均窗口大小', {
		key: 'bd7b492b-98cd-492a-b0b5-a881be581a2e',
		styling: {
			layer: { rows: 4, cols: 15, x: 0, y: 0 },
			widget: { 'background-color': '' },
			displayDensity: 'compact',
			appearance: 'outline'
		},
		component: 'InputControl',
		title: '移动平均窗口大小',
		dataSettings: { dataSource: 'Demo - FoodMart Model', entitySet: 'Sales' },
		options: {
			typeAhead: {},
			dimension: {
				name: null,
				dimension: 'Sales_MA_Periods',
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
				parameter: null
			}
		},
		position: { x: 0, y: 0, cols: 3, rows: 2 }
	})
	await createWidget(storyWidgetRepository, page1, '移动平均值', {
		key: '9ef0b990-90cb-43c8-8433-9c9cc855d908',
		component: 'AnalyticalCard',
		title: '移动平均值',
		dataSettings: {
			dataSource: 'Demo - FoodMart Model',
			entitySet: 'Sales',
			chartAnnotation: {
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
						formatting: { shortNumber: true, decimal: null, unit: '元', useUnderlyingUnit: null },
						parameter: null,
						measure: 'Sales'
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
						formatting: null,
						parameter: null,
						measure: 'Sales_MA',
						role: null
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
						formatting: null,
						parameter: null,
						measure: 'Sales_MA_Forward'
					}
				],
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
						parameter: null
					}
				],
				chartType: { type: 'Line', orient: null, variant: null }
			},
			selectionVariant: {
				selectOptions: [
					{
						dimension: { dimension: '[Time]', hierarchy: '[Time]' },
						currentDate: 'TODAY',
						ranges: [
							{
								type: 'Standard',
								granularity: 'Month',
								current: { direction: 'LookBack', granularity: 'Day', amount: 2 },
								lookBack: 24,
								lookAhead: null,
								formatter: null,
								result: ['201912', '202112']
							}
						],
						allowModifySelections: null,
						selctionType: null
					}
				]
			}
		},
		options: {
			displayDensity: 'compact'
		},
		chartSettings: {},
		chartOptions: {
			grid: null,
			tooltip: {
				show: null,
				showContent: null,
				trigger: 'axis',
				appendToBody: null,
				axisPointer: { type: null, axis: null, snap: null }
			},
			legend: null,
			dataZoom: null,
			colors: null,
			aria: null,
			categoryAxis: {
				show: null,
				position: null,
				offset: null,
				showName: null,
				inverse: null,
				boundaryGap: null,
				min: '0',
				max: null,
				silent: null,
				axisLine: {
					show: null,
					onZero: null,
					symbol: null,
					symbolOffset: null,
					symbolSize: null,
					lineStyle: { color: null, width: null, type: null }
				},
				axisLabel: { show: null, interval: '', inside: null, rotate: null }
			},
			valueAxis: null,
			seriesStyle: null
		},
		selectionPresentationVariants: null,
		fullscreen: false,
		position: { x: 5, y: 0, cols: 8, rows: 5 },
		styling: {
			appearance: {
				displayDensity: 'compact'
			}
		}
	})
	await createWidget(storyWidgetRepository, page1, '前后移动平均值', {
		key: 'ec2f65fc-1374-4105-bc63-1ac45059f8df',
		styling: {
			appearance: {
				displayDensity: 'compact'
			}
		},
		component: 'AnalyticalCard',
		title: '前后移动平均值',
		dataSettings: {
			dataSource: 'Demo - FoodMart Model',
			entitySet: 'Sales',
			chartAnnotation: {
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
						formatting: { shortNumber: true, decimal: null, unit: '元', useUnderlyingUnit: null },
						parameter: null,
						measure: 'Sales'
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
						formatting: null,
						parameter: null,
						measure: 'Sales_MA_Back_Forward',
						role: null
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
						formatting: null,
						parameter: null,
						measure: 'Sales_MA_Start',
						role: 'Tooltip'
					}
				],
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
						parameter: null
					}
				],
				chartType: { type: 'Line', orient: null, variant: null }
			},
			selectionVariant: {
				selectOptions: [
					{
						dimension: { dimension: '[Time]', hierarchy: '[Time]' },
						currentDate: 'TODAY',
						ranges: [
							{
								type: 'Standard',
								granularity: 'Month',
								current: { direction: null, granularity: null, amount: null },
								lookBack: 24,
								lookAhead: 0,
								formatter: null,
								result: ['201912', '202112']
							}
						],
						allowModifySelections: null,
						selctionType: null
					}
				]
			}
		},
		options: {
			displayDensity: 'compact'
		},
		chartSettings: {},
		chartOptions: {
			grid: null,
			tooltip: {
				show: null,
				showContent: null,
				trigger: 'axis',
				appendToBody: null,
				axisPointer: { type: null, axis: null, snap: null }
			},
			legend: null,
			dataZoom: null,
			colors: null,
			aria: null,
			categoryAxis: {
				show: null,
				position: null,
				offset: null,
				showName: null,
				inverse: null,
				boundaryGap: null,
				min: '0',
				max: null,
				silent: null,
				axisLine: {
					show: null,
					onZero: null,
					symbol: null,
					symbolOffset: null,
					symbolSize: null,
					lineStyle: { color: null, width: null, type: null }
				},
				axisLabel: { show: null, interval: '', inside: null, rotate: null }
			},
			valueAxis: null,
			seriesStyle: null
		},
		selectionPresentationVariants: null,
		fullscreen: false,
		position: { x: 5, y: 5, cols: 8, rows: 5 }
	})
}
