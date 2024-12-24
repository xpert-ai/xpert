import { ICommand } from '@nestjs/cqrs'

export class XpertDelIntegrationCommand implements ICommand {
	static readonly type = '[Xpert] Delete integration'

	constructor(
		public readonly id: string,
		public readonly integration: string
	) { }
}
