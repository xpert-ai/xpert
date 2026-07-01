import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'
import { XpertWorkspace } from '../workspace.entity'

/**
 */
export class MyXpertWorkspaceQuery implements IQuery {
	static readonly type = '[Xpert Workspace] My'

	constructor(
		public readonly userId: string,
		public readonly input: Pick<FindManyOptions<XpertWorkspace>, 'relations'> &
			Pick<FindManyOptions<XpertWorkspace>, 'where'>,
		public readonly options?: {
			includeOrganizationWorkspacesInTenantScope?: boolean
		}
	) {}
}
