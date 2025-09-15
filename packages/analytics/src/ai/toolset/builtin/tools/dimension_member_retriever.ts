import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, getToolCallIdFromConfig } from '@metad/contracts'
import { AggregationRole, getEntityProperty2, PropertyLevel, wrapBrackets } from '@metad/ocap-core'
import { t } from 'i18next'
import { formatDocumentsAsString } from 'langchain/util/document'
import { firstValueFrom } from 'rxjs'
import { z } from 'zod'
import { RetrieveMembersCommand } from '../../../../model-member'
import { TBIContext } from '../../../types'

/**
 * Build a tool for dimension members retrieval.
 *
 * @param context Chat Context
 * @param name Tool name
 */
export function buildDimensionMemberRetrieverTool(context: Partial<TBIContext>, name: string) {
	const { dsCoreService, commandBus } = context

	return tool(
		async ({ modelId, cube, dimension, hierarchy, level, query, topK, re_embedding }, config) => {
			const toolCallId = getToolCallIdFromConfig(config)
			const _dataSource = await firstValueFrom(dsCoreService.getDataSource(modelId))
			const entityType = await firstValueFrom(_dataSource.selectEntityType(cube))
			if (entityType instanceof Error) {
				throw entityType
			}

			if (dimension) {
				dimension = wrapBrackets(dimension)
				const property = getEntityProperty2(entityType, dimension)
				if (!property) {
					throw new Error(
						t('Error.NoPropertyFoundFor', {
							ns: 'core',
							cube: entityType.name,
							name: dimension
						})
					)
				}
				if (property.role === AggregationRole.hierarchy || property.role === AggregationRole.level) {
					dimension = property.dimension
				}
			}
			if (hierarchy) {
				hierarchy = wrapBrackets(hierarchy)
				const property = getEntityProperty2(entityType, hierarchy)
				if (!property) {
					throw new Error(
						t('Error.NoPropertyFoundFor', {
							ns: 'core',
							cube: entityType.name,
							name: hierarchy
						})
					)
				}
				if (property.role === AggregationRole.level) {
					hierarchy = (<PropertyLevel>property).hierarchy
				}
			}
			if (level) {
				const property = getEntityProperty2(entityType, level)
				if (!property) {
					throw new Error(
						t('Error.NoPropertyFoundFor', {
							ns: 'core',
							cube: entityType.name,
							name: level
						})
					)
				}
			}

			const docs = await commandBus.execute(
				new RetrieveMembersCommand(query || '*', {
					dsCoreService,
					modelId,
					cube,
					dimension,
					hierarchy,
					level,
					topK,
					reEmbedding: re_embedding
				})
			)

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCallId,
				category: 'Computer',
				type: ChatMessageStepCategory.Knowledges,
				data: docs.map(([doc]) => doc)
			})
			return docs.map(([doc]) => 
				`- Caption: ${doc.metadata.caption || ''}; Key: \`${doc.metadata.key}\``
			).join('\n')
		},
		{
			name,
			description:
				'Search for dimension member key information about filter conditions. For any needs about filtering data, you must use this tool!',
			schema: z.object({
				modelId: z.string().describe('The model ID'),
				cube: z.string().describe('The cube name'),
				query: z.string().describe('The keywords to look up members'),
				dimension: z.string().describe('The dimension to look up in the retriever'),
				hierarchy: z.string().optional().describe('The hierarchy to look up in the retriever'),
				level: z.string().optional().describe('The level to look up in the retriever'),
				topK: z.number().optional().describe('Top k results'),
				re_embedding: z
					.boolean()
					.optional()
					.nullable()
					.default(false)
					.describe(
						'Need re-embedding dimension members if the user explicitly requires, otherwise the default is false'
					)
			})
		}
	)
}
