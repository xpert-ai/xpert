import { SetMetadata } from '@nestjs/common'

/**
 * Metadata key for chat channel
 */
export const CHAT_CHANNEL = 'CHAT_CHANNEL'

/**
 * Decorator for chat channel implementations
 *
 * Use this decorator to register a chat channel implementation.
 * The decorated class will be automatically discovered and registered
 * to ChatChannelRegistry on module initialization.
 *
 * @param type - The channel type identifier (e.g., 'lark', 'wecom', 'dingtalk')
 *
 * @example
 * ```typescript
 * @Injectable()
 * @ChatChannel('lark')
 * export class LarkChatChannel implements IChatChannel {
 *   // Implementation
 * }
 * ```
 */
export const ChatChannel = (type: string) => SetMetadata(CHAT_CHANNEL, type)
