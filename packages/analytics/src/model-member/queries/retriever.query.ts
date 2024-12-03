import { IQuery } from '@nestjs/cqrs'

export class DimensionMemberRetrieverQuery implements IQuery {
	static readonly type = '[DimensionMember] Get Retriever'

	constructor(
		public readonly tenantId?: string,
		public readonly organizationId?: string,
	) {}
}
