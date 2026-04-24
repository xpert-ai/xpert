import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { FindOptionsRelationByString } from 'typeorm'
import { XpertWorkspaceAccessService } from '../../workspace-access.service'
import { GetXpertWorkspaceQuery } from '../get-one.query'

@QueryHandler(GetXpertWorkspaceQuery)
export class GetXpertWorkspaceHandler implements IQueryHandler<GetXpertWorkspaceQuery> {
	private readonly logger = new Logger(GetXpertWorkspaceHandler.name)

	constructor(private readonly workspaceAccessService: XpertWorkspaceAccessService) {}

	async execute(query: GetXpertWorkspaceQuery) {
		const { input } = query
		const { id, options } = input
		const relations = options?.relations as FindOptionsRelationByString

		if (!id || id === 'null') {
			return {}
		}

		const { workspace } = await this.workspaceAccessService.assertCanRead(id, { relations })
		return workspace
	}
}
