import { Employee } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import {
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget,
} from '../../../../entities/internal'
import { createBarPage } from './bar'
import { createDistributionPage } from './distribution'
import { createLinePage } from './line'
import { createPiePage } from './pie'
import { createScatterPage } from './scatter'

export const STORY_NAME = 'Demo - Charts'
export const STORY_OPTIONS = {
	options: {
		advancedStyle:
			'.nx-story__story-container .nx-story__layout.mobile .nx-story-widget {\r\n    margin-bottom: 1rem;\r\n}',
	},
	schema: {
		entitySets: {
			Sales: {
				name: 'Sales',
				entityType: {
					name: 'Sales',
					properties: {
						'Product Quantity': {
							name: 'Product Quantity',
							calculationType: 'Calculated',
							formula: 'Count(\r\n  [Product].CurrentMember.Children\r\n)',
							role: 'measure',
							dataType: 'number',
						},
					},
				},
			},
		},
	},
	filterBar: {
		options: {
			today: {
				enable: true,
				granularity: 'Day',
				granularitySequence: '2',
				defaultValue: 'DBY',
			},
			appearance: 'standard',
			liveMode: true,
		},
	},
}

export async function createDemoChartsStory(
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

	await createLinePage(
		employee,
		story,
		storyPageRepository,
		storyWidgetRepository
	)
	await createBarPage(
		employee,
		story,
		storyPageRepository,
		storyWidgetRepository
	)
	await createPiePage(
		employee,
		story,
		storyPageRepository,
		storyWidgetRepository
	)
	await createScatterPage(
		employee,
		story,
		storyPageRepository,
		storyWidgetRepository
	)
	await createDistributionPage(
		employee,
		story,
		storyPageRepository,
		storyWidgetRepository
	)
}
