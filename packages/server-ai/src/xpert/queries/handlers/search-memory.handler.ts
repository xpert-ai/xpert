import { BaseStore } from '@langchain/langgraph'
import { IUser, IXpertAgent } from '@metad/contracts'
import { RequestContext, UserService } from '@metad/server-core'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { compact, uniq } from 'lodash'
import { In } from 'typeorm'
import { CreateCopilotStoreCommand, StoreItemDTO } from '../../../copilot-store'
import { CopilotNotFoundException } from '../../../core/errors'
import { createMemoryEmbeddings } from '../../types'
import { XpertService } from '../../xpert.service'
import { GetXpertAgentQuery } from '../get-xpert-agent.query'
import { SearchXpertMemoryQuery } from '../search-memory.query'

@QueryHandler(SearchXpertMemoryQuery)
export class SearchXpertMemoryHandler implements IQueryHandler<SearchXpertMemoryQuery> {
	constructor(
		private readonly service: XpertService,
		private readonly userService: UserService,
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

		const embeddings = await createMemoryEmbeddings(memory, this.queryBus, { tenantId, organizationId })
		if (!embeddings) {
			throw new CopilotNotFoundException(`Not found the embeddings role copilot`)
		}

		const userId = RequestContext.currentUserId()
		const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
			new CreateCopilotStoreCommand({
				tenantId,
				organizationId,
				userId,
				index: {
					dims: null,
					embeddings
					// fields
				}
			})
		)

		const namespacePrefix = options.type ? [xpert.id, options.type] : [xpert.id]
		const items = (await store.search(namespacePrefix, { query: options.text })) as unknown as { createdById: string }[]
		// Asociate createdById with user details
		const userIds = compact(uniq(items.map((item) => item.createdById)))
		let users: IUser[] = []
		if (userIds.length) {
			const result = await this.userService.findAll({ where: { id: In(userIds) } })
			users = result.items
		}
		return items.map(
			(item) => new StoreItemDTO({ ...item, createdBy: users.find((_) => _.id === item.createdById) })
		)
	}
}
