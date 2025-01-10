import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated Use ChatBI toolset
 */
export class UserSessionCommand implements ICommand {
	static readonly type = '[ChatBI] User Session'

	constructor(
		public readonly input: {
			tenantId: string
			organizationId: string
			userId: string
			chatModelId: string
		}
	) {}
}
