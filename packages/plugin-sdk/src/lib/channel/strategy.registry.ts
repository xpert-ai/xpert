import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { CHAT_CHANNEL } from './strategy.decorator'
import { IChatChannel } from './strategy.interface'

/**
 * Chat Channel Registry
 *
 * Manages all registered chat channel implementations.
 * Channels are automatically discovered and registered via @ChatChannel decorator.
 *
 * Supports:
 * - Organization-scoped channels
 * - Global channels (fallback)
 * - Plugin-based registration/removal
 * - Dynamic channel lookup
 *
 * @example
 * ```typescript
 * // Get channel by type
 * const channel = registry.get('lark')
 *
 * // List all available channels for an organization
 * const channels = registry.list(organizationId)
 *
 * // Send message using a channel
 * await channel.sendText(ctx, 'Hello!')
 * ```
 */
@Injectable()
export class ChatChannelRegistry extends BaseStrategyRegistry<IChatChannel> {
	constructor(discoveryService: DiscoveryService, reflector: Reflector) {
		super(CHAT_CHANNEL, discoveryService, reflector)
	}
}
