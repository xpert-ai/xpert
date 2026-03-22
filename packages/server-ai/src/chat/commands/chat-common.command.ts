import { IUser, TChatOptions, TChatRequest } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * General chat agent or project general agent
 */
export class ChatCommonCommand implements ICommand {
    static readonly type = '[Chat] General Agent'

    constructor(
        public readonly request: TChatRequest,
        public readonly options: TChatOptions & {
            isDraft?: boolean
            tenantId: string
            organizationId: string
            user: IUser
        }
    ) {}
}
