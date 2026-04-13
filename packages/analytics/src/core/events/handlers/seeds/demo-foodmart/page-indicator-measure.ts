import { Employee } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import {
	Indicator,
	Story,
	StoryPoint,
	StoryWidget,
} from '../../../../entities/internal'
import { createWidget } from '../common'
import {
	ENTITY_INVENTORY,
	ENTITY_SALES,
	SEMANTIC_MODEL_NAME,
} from '../semantic-model'

const pageName = '指标度量'
export const pageOptions = {
	type: 1,
	key: '2224d494-66d4-49b3-b006-f5469294cf6f',
	index: 4,
	responsive: null,
	gridOptions: {
		gridType: 'fixed',
		setGridSize: true,
		fixedColWidth: 15,
		fixedRowHeight: 15,
		compactType: 'compactUp&Left',
	},
	filterBar: null,
	styling: { canvas: {}, pageSize: {} },
	fullscreen: false,
}

export async function createIndicatorMeasuresPage(
	employee: Employee,
	story: Story,
	storyPageRepository: Repository<StoryPoint>,
	storyWidgetRepository: Repository<StoryWidget>,
	indicatorRepository: Repository<Indicator>
) {
	let page = new StoryPoint()
	page.tenantId = employee.tenantId
	page.createdById = employee.userId
	page.organizationId = employee.organizationId
	page.storyId = story.id
	page.name = pageName
	page.options = pageOptions
	page = await storyPageRepository.save(page)

	await createWidget(storyWidgetRepository, page, '图形中指标度量', {
		title: '图形中使用指标度量',
		key: 'fbf1bb8c-9ece-427c-88ba-1ba844d29d28',
		component: 'AnalyticalCard',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_INVENTORY,
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
						formatting: {
							shortNumber: true,
							decimal: null,
							unit: null,
							useUnderlyingUnit: null,
						},
						parameter: null,
						measure: 'SCMIN1001',
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
							decimal: null,
							unit: null,
							useUnderlyingUnit: null,
						},
						parameter: null,
						measure: 'SALST1003',
					},
				],
				dimensions: [
					{
						name: null,
						dimension: '[Time]',
						hierarchy: '[Time]',
						level: '[Time].[Month]',
						members: [{ value: '[2021]', label: '2021' }],
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: null,
						parameter: null,
						role: null,
					},
				],
				chartType: { type: 'Bar' },
			},
		},
		position: { x: 0, y: 0, rows: 14, cols: 21 },
		chartSettings: {},
		chartOptions: {
			grid: null,
			tooltip: null,
			legend: null,
			dataZoom: {
				type: 'inside',
				filterMode: null,
				startValue: null,
				endValue: null,
				yAxisIndex: null,
			},
			colors: null,
			aria: null,
			categoryAxis: null,
			valueAxis: null,
			seriesStyle: null,
		},
		styling: { widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
	})

	await createWidget(storyWidgetRepository, page, '表格中指标度量', {
		title: '表格中使用指标度量',
		key: '1380c448-9c6d-4b3b-a040-fef84aed3889',
		component: 'AnalyticalGrid',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_INVENTORY,
			analytics: {
				rows: [
					{
						name: null,
						dimension: '[Time]',
						hierarchy: '[Time]',
						level: '[Time].[Year]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: 'descriptionOnly',
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: null,
						parameter: null,
					},
				],
				columns: [
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
						measure: 'SCMIN1001',
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
						measure: 'SCMIN1002',
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
						measure: 'SCMIN1003',
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
						measure: 'SALST1002',
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
						measure: 'SALST1004',
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
						measure: 'SALST1005',
					},
				],
			},
		},
		position: { x: 21, y: 0, rows: 13, cols: 24 },
		options: {
			column: {},
			displayDensity: 'compact',
			showToolbar: true,
			exportExcel: true,
			columnPinning: true,
			allowFiltering: false,
		},
		styling: {
			appearance: {
				displayDensity: 'compact',
			},
			widget: {} },
	})

	const indicators = [
		{
			id: '',
			code: 'SCMIN1001',
			name: '美国仓库库存',
			groupName: '美国',
			isUnderline: true,
			isItalic: true,
		},
		{
			code: 'SALST1004',
		},
		{
			code: 'SALST1005',
		},
		{
			code: 'SCMIN1002',
		},
		{
			code: 'SALST1000',
		},
	]
	for (const indicator of indicators) {
		indicator.id = (
			await indicatorRepository.findOne({
				where: {
					tenantId: employee.tenantId,
					organizationId: employee.organizationId,
					code: indicator.code,
				},
			})
		).id
	}

	await createWidget(storyWidgetRepository, page, '指标表格中指标', {
		title: '指标表格中使用指标',
		key: '09cbbbe2-3041-4480-ba6e-0de46ef55e51',
		component: 'AccountingStatement',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_INVENTORY,
		},
		position: { x: 0, y: 14, rows: 10, cols: 21 },
		options: {
			name: '指标表格中使用指标',
			measures: [
				{ name: 'CURRENT', label: '当期' },
				{ name: 'MOM', isRatio: true, isSemanticColor: true, label: '环比' },
				{ name: 'PYSM', label: '同期' },
				{ name: 'YOY', label: '同比', isRatio: true },
			],
			indicators,
		},
		styling: {
			appearance: {
				displayDensity: 'compact',
			},
			widget: {} },
	})

	await createWidget(storyWidgetRepository, page, '透视表中指标度量', {
		title: '透视表中使用指标度量',
		key: '74a9e1bc-15a7-44c8-89d6-5080a35631ed',
		component: 'AnalyticalGrid',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
			analytics: {
				rows: [
					{
						name: null,
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store Country]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: null,
						parameter: null,
					},
				],
				columns: [
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
						zeroSuppression: null,
						formatting: null,
						parameter: null,
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
						measure: 'PRDSALE_JEFFERS',
					},
				],
			},
		},
		position: { x: 21, y: 13, rows: 11, cols: 24 },
		options: {
			column: {},
			columns: [],
			showToolbar: true,
			exportExcel: true,
			allowFiltering: true,
			filterMode: 'excelStyleFilter',
			columnSelection: 'single',
		},
		styling: { 
			appearance: {
				displayDensity: 'compact',
			},
			widget: {} },
		fullscreen: false,
	})

	await createWidget(storyWidgetRepository, page, '多维度图形使用指标度量', {
		title: '多维度图形使用指标度量',
		key: 'a0a1ddf7-50ff-4ada-bbc9-589f12087558',
		component: 'AnalyticalCard',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
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
						formatting: null,
						parameter: null,
						measure: 'PRDSALE_JEFFERS',
					},
				],
				dimensions: [
					{
						name: null,
						dimension: '[Time]',
						hierarchy: '[Time]',
						level: '[Time].[Month]',
						members: [{ value: '[2021]', label: '2021' }],
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: null,
						parameter: null,
						role: null,
					},
					{
						name: null,
						dimension: '[Store]',
						hierarchy: '[Store]',
						level: '[Store].[Store Country]',
						members: null,
						properties: null,
						label: null,
						displayBehaviour: null,
						displayHierarchy: null,
						unbookedData: null,
						zeroSuppression: null,
						formatting: null,
						parameter: null,
						role: 'Stacked',
					},
				],
				chartType: { type: 'Bar' },
			},
		},
		position: { x: 0, y: 24, rows: 12, cols: 22 },
		chartSettings: {},
		chartOptions: {
			grid: null,
			tooltip: null,
			legend: null,
			dataZoom: {
				type: 'inside',
				filterMode: null,
				startValue: null,
				endValue: null,
				yAxisIndex: null,
			},
			colors: null,
			aria: null,
			categoryAxis: null,
			valueAxis: null,
			seriesStyle: null,
		},
		styling: {
			appearance: {
				displayDensity: 'compact',
			},
			widget: {}, echartsOptions: {} },
		selectionPresentationVariants: null,
	})
}
