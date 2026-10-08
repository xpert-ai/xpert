import { IUser, TChatMessageEnvelope, TChatOptions, TChatRequest } from '@xpert-ai/contracts'
import type { RedisStreamPersistenceTarget } from '../../shared/stream/redis-sse.service'
import { ICommand } from '@nestjs/cqrs'

/**
 * General chat agent or project general agent
 */
export class ChatCommonCommand implements ICommand {
    static readonly type = '[Chat] General Agent'

    constructor(
        public readonly request: TChatRequest,
        public readonly options: TChatOptions & {
            streamPersistence?: RedisStreamPersistenceTarget
            isDraft?: boolean
            execution?: { id: string }
            messageEnvelope?: TChatMessageEnvelope
            tenantId: string
            organizationId: string
            user: IUser
        }
    ) {}
}
