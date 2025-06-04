import { IQuery } from '@nestjs/cqrs'

/**
 * @deprecated
 */
export class DimensionMemberRetrieverToolQuery implements IQuery {
	static readonly type = '[DimensionMember] Get Retriever Tool'

	constructor(
		public readonly name: string,
		public readonly tenantId?: string,
		public readonly organizationId?: string,
	) {}
}
