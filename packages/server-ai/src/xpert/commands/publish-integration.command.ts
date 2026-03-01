import { IIntegration } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated use workflow trigger instead
 */
export class XpertPublishIntegrationCommand implements ICommand {
	static readonly type = '[Xpert Role] Publish to integration'

	constructor(
		public readonly id: string,
		public readonly integration: Partial<IIntegration>
	) { }
}
