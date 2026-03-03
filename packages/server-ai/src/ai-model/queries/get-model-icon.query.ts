import { IQuery } from '@nestjs/cqrs'

export class AIModelGetIconQuery implements IQuery {
	static readonly type = '[AI Model] Get Icon'

	constructor(
		public readonly provider: string,
		public readonly iconType: string,
		public readonly lang: string,
		public readonly organizationId?: string,
	) {}
}
