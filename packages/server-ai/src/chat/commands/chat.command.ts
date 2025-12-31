import { IUser, TChatOptions, TChatRequest } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatCommand implements ICommand {
	static readonly type = '[Chat] Message'

	constructor(
		public readonly request: TChatRequest,
		public readonly options: TChatOptions & {
			xpertId?: string
			isDraft?: boolean
			tenantId: string
			organizationId: string
			user: IUser
		}
	) {}
}
