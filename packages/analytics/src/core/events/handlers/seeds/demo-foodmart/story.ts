import { Employee } from '@metad/server-core'
import { Repository } from 'typeorm'
import {
	Indicator,
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget,
} from '../../../../entities/internal'
import { createIndicatorMeasuresPage } from './page-indicator-measure'
import {
	createStoryWidgetAccountingStatement,
	createStoryWidgetSwiper,
	createStoryWidgetTabset,
} from './story-page1'
import { createPage2Widget1 } from './story-page2'
import {
	createPage3FilterBar,
	createPage3Widget1,
	createPage3Widget2,
	createPage3Widget3,
	page3Name,
	page3Options,
} from './story-page3'
import { createPage4Widget1 } from './story-page4'

export const STORY_NAME = 'Demo - FoodMart Dashboard'
export const STORY_OPTIONS = {
	filterBar: {
		options: {
			today: {
				enable: true,
				granularity: 'Month',
				defaultValue: '2021-12-01',
				granularitySequence: '1',
			},
			layout: { direction: 'column' },
			liveMode: true,
		},
		filters: [],
		styling: {},
	},
	options: {
		locale: 'zh-Hans',
		advancedStyle:
			"@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@600&display=swap');\r\n\r\n.nx-story-point:not(.nx-fullscreen) .nx-story__layout.mobile {\r\n    padding: 10px;\r\n}\r\n\r\n.nx-story__story-container .nx-story__layout.mobile .nx-story-widget {\r\n    margin-bottom: 1rem;\r\n}",
		preferences: {
			story: {
				tabBar: 'point',
				watermarkOptions: {
					textAlign: 'left',
					degree: -20,
					width: 300,
					alpha: 0.2,
					height: 300,
				},
				enableWatermark: true,
			},
		},
	},
}

export const page1Name = '财务报表'
export const page1Options = {
	key: '60853c03-d0bd-48d4-affd-cdd3c83db17b',
	type: 1,
	index: 1,
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

export const page2Name = '库存报表'
export const page2Options = {
	key: 'fddc0d02-0696-43a5-bd85-19b7b422e431',
	type: 1,
	index: 2,
	gridOptions: {
		gridType: 'fixed',
		setGridSize: true,
		fixedColWidth: 15,
		fixedRowHeight: 15,
		minCols: 40,
		minRows: 20,
		displayGrid: 'always',
		outerMargin: false,
		'Max Layer Index': 15,
		allowMultiLayer: true,
		scale: 2,
		compactType: 'compactUp&Left',
	},
	filterBar: {
		dataSettings: {
			dataSource: 'Demo - FoodMart Model',
			entitySet: 'Inventory',
			selectionFieldsAnnotation: {
				propertyPaths: [
					{
						name: null,
						dimension: '[Warehouse]',
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
					},
					{
						name: null,
						dimension: '[Store]',
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
					},
					{
						name: null,
						dimension: '[Product]',
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
					},
				],
			},
		},
		options: {
			liveMode: true,
			today: {
				enable: true,
				granularity: 'Month',
				granularitySequence: '1',
				defaultValue: '2021-12-01',
			},
			filters: {
				'[Product]': {
					typeAhead: {},
					styling: {},
					allowedExpressions: 'MultiValue',
					valueListSource: 'DIMENSION',
					cascadingEffect: true,
				},
				'[Store]': {
					typeAhead: {},
					styling: {},
					allowedExpressions: 'MultiValue',
				},
				'[Warehouse]': {
					typeAhead: {},
					styling: {},
					allowedExpressions: 'MultiValue',
				},
			},
		},
	},
	styling: {
		canvas: {},
		pageSize: { type: 'fixed', size: 'A4', continuousHeight: true },
	},
}

export const page4Name = 'IFrame'
export const page4Options = {
	key: 'b1880672-6b1a-4d6a-93e4-37e6c0d9c2a5',
	type: 1,
	index: 5,
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
	fullscreen: true,
}

export async function createDemoFoodMartStory(
	employee: Employee,
	semanticModel: SemanticModel,
	storyRepository: Repository<Story>,
	storyPageRepository: Repository<StoryPoint>,
	storyWidgetRepository: Repository<StoryWidget>,
	indicatorRepository: Repository<Indicator>
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

	await createStoryWidgetSwiper(
		storyWidgetRepository,
		indicatorRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page1.id
	)
	await createStoryWidgetAccountingStatement(
		storyWidgetRepository,
		indicatorRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page1.id
	)
	await createStoryWidgetTabset(
		storyWidgetRepository,
		indicatorRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page1.id
	)

	let page2 = new StoryPoint()
	page2.tenantId = employee.tenantId
	page2.createdById = employee.userId
	page2.organizationId = employee.organizationId
	page2.storyId = story.id
	page2.name = page2Name
	page2.options = page2Options
	page2 = await storyPageRepository.save(page2)

	await createPage2Widget1(
		storyWidgetRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page2.id
	)

	let page3 = new StoryPoint()
	page3.tenantId = employee.tenantId
	page3.createdById = employee.userId
	page3.organizationId = employee.organizationId
	page3.storyId = story.id
	page3.name = page3Name
	page3.options = page3Options
	page3 = await storyPageRepository.save(page3)

	await createPage3FilterBar(
		storyWidgetRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page3.id
	)

	await createPage3Widget1(
		storyWidgetRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page3.id
	)
	await createPage3Widget2(
		storyWidgetRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page3.id
	)
	await createPage3Widget3(
		storyWidgetRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page3.id
	)

	let page4 = new StoryPoint()
	page4.tenantId = employee.tenantId
	page4.createdById = employee.userId
	page4.organizationId = employee.organizationId
	page4.storyId = story.id
	page4.name = page4Name
	page4.options = page4Options
	page4 = await storyPageRepository.save(page4)

	await createPage4Widget1(
		storyWidgetRepository,
		employee.tenantId,
		employee.organizationId,
		employee.userId,
		story.id,
		page4.id
	)

	await createIndicatorMeasuresPage(
		employee,
		story,
		storyPageRepository,
		storyWidgetRepository,
		indicatorRepository
	)
}
