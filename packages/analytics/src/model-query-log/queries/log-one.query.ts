import { IQuery } from '@nestjs/cqrs'

export class LogOneQuery implements IQuery {
	static readonly type = '[SemanticModelQueryLog] Get one'

	constructor(
		public readonly id?: string,
		public readonly tenantId?: string,
		public readonly organizationId?: string,
	) {}
}
