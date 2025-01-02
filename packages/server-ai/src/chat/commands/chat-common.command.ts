import { IUser, TChatOptions, TChatRequest } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatCommonCommand implements ICommand {
	static readonly type = '[Chat] Common role'

	constructor(
		public readonly request: Omit<TChatRequest, 'xpertId'>,
		public readonly options: TChatOptions & {
			isDraft?: boolean
			tenantId: string
			organizationId: string
			user: IUser
		}
	) {}
}
