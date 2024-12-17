import { Embeddings } from '@langchain/core/embeddings'
import { BaseStore } from '@langchain/langgraph'
import { AiProviderRole, ICopilot, IXpertAgent, LongTermMemoryTypeEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotGetOneQuery, CopilotOneByRoleQuery } from '../../../copilot'
import { CopilotModelGetEmbeddingsQuery } from '../../../copilot-model'
import { CreateCopilotStoreCommand } from '../../../copilot-store'
import { CopilotNotFoundException } from '../../../core/errors'
import { XpertService } from '../../xpert.service'
import { GetXpertAgentQuery } from '../get-xpert-agent.query'
import { SearchXpertMemoryQuery } from '../search-memory.query'

@QueryHandler(SearchXpertMemoryQuery)
export class SearchXpertMemoryHandler implements IQueryHandler<SearchXpertMemoryQuery> {
	constructor(
		private readonly service: XpertService,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: SearchXpertMemoryQuery) {
		const { xpertId, options } = command

		const xpert = await this.service.findOne(xpertId, { relations: ['agent'] })
		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpert.id, xpert.agent.key, command.options?.isDraft)
		)

		const { tenantId, organizationId } = xpert
		const memory = agent.team.memory

		if (!memory?.enabled) {
			return
		}

		let copilot: ICopilot = null
		if (memory.copilotModel?.copilotId) {
			copilot = await this.queryBus.execute(
				new CopilotGetOneQuery(tenantId, memory.copilotModel.copilotId, ['copilotModel', 'modelProvider'])
			)
		} else {
			copilot = await this.queryBus.execute(
				new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding, [
					'copilotModel',
					'modelProvider'
				])
			)
		}

		if (!copilot?.enabled) {
			throw new CopilotNotFoundException(`Not found the embeddinga role copilot`)
		}

		let embeddings = null
		const copilotModel = memory.copilotModel ?? copilot.copilotModel
		if (copilotModel && copilot?.modelProvider) {
			embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
				new CopilotModelGetEmbeddingsQuery(copilot, copilotModel, {
					tokenCallback: (token) => {
						// execution.embedTokens += token ?? 0
					}
				})
			)
		}

		const fields = []
		if (memory.type === LongTermMemoryTypeEnum.QA) {
			fields.push('input')
		} else {
			fields.push('profile')
		}

		const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
			new CreateCopilotStoreCommand({
				tenantId,
				organizationId,
				userId: RequestContext.currentUserId(),
				index: {
					dims: null,
					embeddings,
					fields
				}
			})
		)

		return await store.search([xpert.id], { query: options.text })
	}
}
