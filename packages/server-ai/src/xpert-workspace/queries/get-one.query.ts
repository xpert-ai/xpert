import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'
import { XpertWorkspace } from '../workspace.entity'
import { IUser } from '@xpert-ai/contracts'

/**
 */
export class GetXpertWorkspaceQuery implements IQuery {
	static readonly type = '[Xpert Workspace] Get one'

	constructor(
		public readonly user: IUser,
	  public readonly input: {
		id: string
		options?: Pick<FindManyOptions<XpertWorkspace>, 'relations'> & Pick<FindManyOptions<XpertWorkspace>, 'where'>
	}) {}
}
