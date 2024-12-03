// import { tool } from '@langchain/core/tools'
// import { MEMBER_RETRIEVER_TOOL_NAME } from '@metad/ocap-core'
// import { formatDocumentsAsString } from 'langchain/util/document'
// import { z } from 'zod'
// import { DimensionMemberRetriever } from '../../model-member/retriever'

// export function createDimensionMemberRetrieverTool(tenantId: string, organizationId: string, retriever: DimensionMemberRetriever) {
// 	return tool(
// 		async ({ modelId, cube, dimension, hierarchy, level, member }) => {
// 			retriever.tenantId = tenantId
// 			retriever.organizationId = organizationId
// 			retriever.modelId = modelId
// 			retriever.cube = cube
// 			try {
// 				const docs = await retriever.invoke(
// 					`${dimension || ''} ${hierarchy ? `hierarchy: ${hierarchy}` : ''} ${level ? `level: ${level}` : ''} ${member}`
// 				)
// 				return formatDocumentsAsString(docs)
// 			} catch (e) {
// 				console.error(e)
// 				return ''
// 			}
// 		},
// 		{
// 			name: MEMBER_RETRIEVER_TOOL_NAME,
// 			description:
// 				'Search for dimension member key information about filter conditions. For any needs about filtering data, you must use this tool!',
// 			schema: z.object({
// 				modelId: z.string().describe('The model ID'),
// 				cube: z.string().describe('The cube name'),
// 				dimension: z.string().describe('The dimension to look up in the retriever'),
// 				hierarchy: z.string().optional().describe('The hierarchy to look up in the retriever'),
// 				level: z.string().optional().describe('The level to look up in the retriever'),
// 				member: z.string().describe('The member to look up in the retriever')
// 			})
// 		}
// 	)
// }
