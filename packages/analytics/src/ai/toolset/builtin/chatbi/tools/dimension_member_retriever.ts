import { tool } from '@langchain/core/tools'
import { AggregationRole, getEntityProperty2, PropertyLevel, wrapBrackets } from '@metad/ocap-core'
import { formatDocumentsAsString } from 'langchain/util/document'
import { firstValueFrom } from 'rxjs'
import { z } from 'zod'
import { t } from 'i18next'
import { DimensionMemberRetriever, SemanticModelMemberService } from '../../../../../model-member'
import { ChatBIContext } from '../types'

export function createDimensionMemberRetrieverTool(
	context: ChatBIContext,
	name: string,
	tenantId: string,
	organizationId: string,
	service: SemanticModelMemberService
) {
	const retriever = new DimensionMemberRetriever(service, tenantId, organizationId)
	const { dsCoreService } = context

	return tool(
		async ({ modelId, cube, dimension, hierarchy, level, member, topK }) => {
			const _dataSource = await dsCoreService._getDataSource(modelId)

			const entityType = await firstValueFrom(_dataSource.selectEntityType(cube))
			if (entityType instanceof Error) {
				throw entityType
			}
			if (dimension) {
				const property = getEntityProperty2(entityType, wrapBrackets(dimension))
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
				const property = getEntityProperty2(entityType, wrapBrackets(hierarchy))
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

			retriever.modelId = modelId
			retriever.cube = cube
			const docs = await retriever.invoke(member, {
				configurable: {
					topK,
					dimension: dimension ? wrapBrackets(dimension) : hierarchy,
					hierarchy: hierarchy ? wrapBrackets(hierarchy) : hierarchy,
					level
				}
			})
			return formatDocumentsAsString(docs)
		},
		{
			name,
			description:
				'Search for dimension member key information about filter conditions. For any needs about filtering data, you must use this tool!',
			schema: z.object({
				modelId: z.string().describe('The model ID'),
				cube: z.string().describe('The cube name'),
				member: z.string().describe('The member to look up in the retriever'),
				dimension: z.string().optional().describe('The dimension to look up in the retriever'),
				hierarchy: z.string().optional().describe('The hierarchy to look up in the retriever'),
				level: z.string().optional().describe('The level to look up in the retriever'),
				topK: z.number().optional().describe('Top k results')
			})
		}
	)
}
