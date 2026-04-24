import { RequestContext } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { XpertWorkspaceAccessService } from '../../workspace-access.service'
import { MyXpertWorkspaceQuery } from '../my.query'

@QueryHandler(MyXpertWorkspaceQuery)
export class MyXpertWorkspaceHandler implements IQueryHandler<MyXpertWorkspaceQuery> {
	private readonly logger = new Logger(MyXpertWorkspaceHandler.name)

	constructor(private readonly workspaceAccessService: XpertWorkspaceAccessService) {}

	async execute(query: MyXpertWorkspaceQuery) {
		const { userId } = query

		if (userId !== RequestContext.currentUserId()) {
			return { items: [], total: 0 }
		}

		const items = await this.workspaceAccessService.findAccessibleWorkspaces()
		return {
			items,
			total: items.length
		}
	}
}
