import { tool } from '@langchain/core/tools'
import { getErrorMessage } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { formatDocumentsAsString } from 'langchain/util/document'
import { z } from 'zod'
import { SemanticModelMemberService } from '../../member.service'
import { DimensionMemberRetriever } from '../../retriever'
import { DimensionMemberRetrieverToolQuery } from '../retriever-tool.query'

@QueryHandler(DimensionMemberRetrieverToolQuery)
export class DimensionMemberRetrieverToolHandler implements IQueryHandler<DimensionMemberRetrieverToolQuery> {
	private readonly logger = new Logger(DimensionMemberRetrieverToolHandler.name)

	constructor(
		private readonly service: SemanticModelMemberService,
		private configService: ConfigService
	) {}

	async execute(query: DimensionMemberRetrieverToolQuery) {
		const retriever = new DimensionMemberRetriever(this.service, query.tenantId, query.organizationId)

		return tool(
			async ({ modelId, cube, dimension, hierarchy, level, member, topK }) => {
				retriever.modelId = modelId
				retriever.cube = cube
				try {
					const docs = await retriever.invoke(member, {
						configurable: {
							topK,
							dimension,
							hierarchy,
							level
						}
					})
					return formatDocumentsAsString(docs)
				} catch (e) {
					// console.error(e)
					return getErrorMessage(e)
				}
			},
			{
				name: query.name,
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
}
