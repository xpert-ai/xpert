import { IQuery } from '@nestjs/cqrs'

export class ToolProviderIconQuery implements IQuery {
	static readonly type = '[Xpert Toolset] Provider Icon'

	constructor(
		public readonly options: {
			organizationId?: string
			provider: string
		},
	) {}
}
