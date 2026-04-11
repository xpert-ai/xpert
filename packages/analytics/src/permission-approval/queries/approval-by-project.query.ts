import { IPermissionApproval } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'

export class ApprovalsByProjectQuery implements IQuery {
	static readonly type = '[Permission Approval] get by project'

	constructor(public readonly input: {
		projectId: string
		options: Pick<FindManyOptions<IPermissionApproval>, 'relations'> & Pick<FindManyOptions<IPermissionApproval>, 'where'>
			& Pick<FindManyOptions<IPermissionApproval>, 'order'>
	}) {}
}
