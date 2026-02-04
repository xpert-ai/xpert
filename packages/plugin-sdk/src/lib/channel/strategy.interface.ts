import { IIntegration } from '@metad/contracts'
import { Request, Response, NextFunction } from 'express'

/**
 * Channel metadata
 */
export type TChatChannelMeta = {
	/**
	 * Channel type identifier
	 */
	type: string // 'lark', 'wecom', 'dingtalk', 'slack'

	/**
	 * Display name
	 */
	label: string

	/**
	 * Description
	 */
	description?: string

	/**
	 * Icon
	 */
	icon?: string

	/**
	 * JSON Schema for integration configuration
	 */
	configSchema?: Record<string, any>
}

/**
 * Channel capabilities declaration
 */
export type TChatChannelCapabilities = {
	/** Supports Markdown messages */
	markdown: boolean
	/** Supports interactive cards */
	card: boolean
	/** Supports card button interactions */
	cardAction: boolean
	/** Supports editing/updating messages */
	updateMessage: boolean
	/** Supports @mentions */
	mention: boolean
	/** Supports group chat */
	group: boolean
	/** Supports message threads/replies */
	thread?: boolean
	/** Supports media messages (images, files) */
	media?: boolean
	/** Maximum characters per message (auto-chunked if exceeded), e.g., Telegram 4096, Discord 2000 */
	textChunkLimit?: number
	/** Supports streaming message updates (typewriter effect) */
	streamingUpdate?: boolean
}

/**
 * Inbound message - unified format from different platforms
 */
export type TChatInboundMessage = {
	/** Platform message ID */
	messageId: string
	/** Chat ID */
	chatId: string
	/** Chat type: private, group, channel, thread */
	chatType: 'private' | 'group' | 'channel' | 'thread'
	/** Sender ID (platform user ID) */
	senderId: string
	/** Sender name */
	senderName?: string
	/** Message content (text) */
	content: string
	/** Content type */
	contentType: 'text' | 'image' | 'file' | 'card_action' | 'voice'
	/** List of mentioned users */
	mentions?: Array<{
		id: string
		name?: string
	}>
	/** Reply-to message ID */
	replyToMessageId?: string
	/** Thread ID (for threaded conversations) */
	threadId?: string
	/** Timestamp */
	timestamp: number
	/** Platform raw event data */
	raw: any
}

/**
 * Card action event - triggered when user clicks card button
 */
export type TChatCardAction = {
	/** Action type/tag */
	type: string
	/** Action value */
	value: any
	/** Message ID the card belongs to */
	messageId: string
	/** Chat ID */
	chatId: string
	/** User ID who triggered the action */
	userId: string
	/** Raw event data */
	raw: any
}

/**
 * Chat context - used for sending messages
 */
export type TChatContext = {
	/** Integration configuration */
	integration: IIntegration
	/** Chat ID */
	chatId: string
	/** Target user ID (for private chat) */
	userId?: string
	/** Thread ID (for thread replies) */
	threadId?: string
	/** Reply-to message ID */
	replyToMessageId?: string
}

/**
 * Send result
 */
export type TChatSendResult = {
	/** Success status */
	success: boolean
	/** Message ID */
	messageId?: string
	/** Error message */
	error?: string
}

/**
 * Event handling context
 */
export type TChatEventContext<TConfig = any> = {
	/** Integration configuration */
	integration: IIntegration<TConfig>
	/** Tenant ID */
	tenantId: string
	/** Organization ID */
	organizationId: string
}

/**
 * Event handling callbacks
 */
export type TChatEventHandlers = {
	/** Called when message is received */
	onMessage?: (message: TChatInboundMessage, ctx: TChatEventContext) => Promise<void>
	/** Called on card interaction */
	onCardAction?: (action: TChatCardAction, ctx: TChatEventContext) => Promise<void>
	/** Called when @mentioned in group chat */
	onMention?: (message: TChatInboundMessage, ctx: TChatEventContext) => Promise<void>
}

/**
 * Chat channel interface
 *
 * For bidirectional messaging platforms (Lark, WeCom, DingTalk, Slack, etc.)
 * Supports: receive message → invoke Xpert → reply message
 *
 * @example
 * ```typescript
 * @Injectable()
 * @ChatChannel('lark')
 * export class LarkChatChannel implements IChatChannel {
 *   meta = { type: 'lark', label: 'Lark', ... }
 *
 *   createEventHandler(ctx, handlers) {
 *     // Return Express middleware for handling Webhook
 *   }
 *
 *   async sendText(ctx, content) {
 *     // Send text message via Lark API
 *   }
 * }
 * ```
 */
export interface IChatChannel<TConfig = any, TEvent = any> {
	/**
	 * Channel metadata
	 */
	meta: TChatChannelMeta

	/**
	 * Channel capabilities declaration
	 */
	capabilities: TChatChannelCapabilities

	// ==================== Inbound (receive messages) ====================

	/**
	 * Create Webhook/event handler
	 *
	 * Returns Express middleware for handling inbound Webhooks.
	 * The middleware should:
	 * 1. Verify request (signature, token)
	 * 2. Parse event
	 * 3. Call appropriate handler callbacks (onMessage, onCardAction, etc.)
	 *
	 * @param ctx - Event context containing integration configuration
	 * @param handlers - Callback functions for different event types
	 * @returns Express middleware
	 */
	createEventHandler(
		ctx: TChatEventContext<TConfig>,
		handlers: TChatEventHandlers
	): (req: Request, res: Response, next?: NextFunction) => Promise<void>

	/**
	 * Parse inbound event to unified message format
	 *
	 * @param event - Platform raw event
	 * @param ctx - Event context
	 * @returns Parsed message, or null if not a message event
	 */
	parseInboundMessage?(event: TEvent, ctx: TChatEventContext<TConfig>): TChatInboundMessage | null

	/**
	 * Parse card action event
	 *
	 * @param event - Platform raw event
	 * @param ctx - Event context
	 * @returns Parsed card action, or null if not a card action event
	 */
	parseCardAction?(event: TEvent, ctx: TChatEventContext<TConfig>): TChatCardAction | null

	/**
	 * Check if bot is @mentioned in message
	 *
	 * @param message - Inbound message
	 * @param botId - Bot's user ID on the platform
	 * @returns True if bot is mentioned
	 */
	isBotMentioned?(message: TChatInboundMessage, botId: string): boolean

	// ==================== Outbound (send messages) ====================

	/**
	 * Send text message
	 *
	 * @param ctx - Chat context
	 * @param content - Text content
	 * @returns Send result
	 */
	sendText(ctx: TChatContext, content: string): Promise<TChatSendResult>

	/**
	 * Send Markdown message
	 *
	 * @param ctx - Chat context
	 * @param content - Markdown content
	 * @returns Send result
	 */
	sendMarkdown?(ctx: TChatContext, content: string): Promise<TChatSendResult>

	/**
	 * Send interactive card
	 *
	 * @param ctx - Chat context
	 * @param card - Card content (platform-specific format)
	 * @returns Send result
	 */
	sendCard?(ctx: TChatContext, card: any): Promise<TChatSendResult>

	/**
	 * Send media message (image, file)
	 *
	 * @param ctx - Chat context
	 * @param media - Media info
	 * @returns Send result
	 */
	sendMedia?(
		ctx: TChatContext,
		media: {
			/** Media type */
			type: 'image' | 'file' | 'audio' | 'video'
			/** Media URL */
			url?: string
			/** Media content (Buffer) */
			content?: Buffer
			/** Filename */
			filename?: string
		}
	): Promise<TChatSendResult>

	/**
	 * Update/edit sent message
	 *
	 * @param ctx - Chat context
	 * @param messageId - Message ID to update
	 * @param content - New content
	 * @returns Send result
	 */
	updateMessage?(ctx: TChatContext, messageId: string, content: string | any): Promise<TChatSendResult>

	// ==================== Utility methods ====================

	/**
	 * Get bot information
	 *
	 * @param integration - Integration configuration
	 * @returns Bot info (ID, name, avatar, etc.)
	 */
	getBotInfo?(integration: IIntegration<TConfig>): Promise<{
		/** Bot ID */
		id: string
		/** Bot name */
		name?: string
		/** Bot avatar URL */
		avatar?: string
	}>

	/**
	 * Validate integration configuration
	 *
	 * @param config - Configuration to validate
	 * @returns Validation result
	 */
	validateConfig?(config: TConfig): Promise<{
		/** Is valid */
		valid: boolean
		/** Error list */
		errors?: string[]
	}>

	/**
	 * Test connection
	 *
	 * @param integration - Integration to test
	 * @returns Test result
	 */
	testConnection?(integration: IIntegration<TConfig>): Promise<{
		/** Success status */
		success: boolean
		/** Message */
		message?: string
	}>

	// ==================== Status monitoring ====================

	/**
	 * Get channel runtime status (for monitoring and operations)
	 *
	 * @param integration - Integration configuration
	 * @returns Channel status
	 */
	getStatus?(integration: IIntegration<TConfig>): Promise<TChatChannelStatus>
}

/**
 * Channel runtime status (for monitoring)
 */
export type TChatChannelStatus = {
	/** Is connected/running */
	connected: boolean
	/** Last activity timestamp */
	lastActivityAt?: number
	/** Last inbound message timestamp */
	lastInboundAt?: number
	/** Last outbound message timestamp */
	lastOutboundAt?: number
	/** Last error message */
	error?: string
}

/**
 * Common platform message length limits
 */
export const CHAT_CHANNEL_TEXT_LIMITS: Record<string, number> = {
	lark: 4000,
	wecom: 2048,
	dingtalk: 4000,
	slack: 4000,
	telegram: 4096,
	discord: 2000
}

/**
 * Chunk long text by specified length
 *
 * @param text - Text to chunk
 * @param limit - Maximum characters per chunk
 * @param mode - Chunking mode: 'text' splits by character, 'markdown' tries to preserve paragraphs
 * @returns Array of chunked text
 */
export function chunkText(text: string, limit: number, mode: 'text' | 'markdown' = 'text'): string[] {
	if (!text || text.length <= limit) {
		return [text]
	}

	const chunks: string[] = []

	if (mode === 'markdown') {
		// Markdown mode: try to split at paragraph boundaries
		const paragraphs = text.split(/\n\n+/)
		let currentChunk = ''

		for (const para of paragraphs) {
			if (currentChunk.length + para.length + 2 <= limit) {
				currentChunk += (currentChunk ? '\n\n' : '') + para
			} else if (para.length > limit) {
				// Paragraph itself is too long, need hard split
				if (currentChunk) {
					chunks.push(currentChunk)
					currentChunk = ''
				}
				let remaining = para
				while (remaining.length > limit) {
					chunks.push(remaining.slice(0, limit))
					remaining = remaining.slice(limit)
				}
				currentChunk = remaining
			} else {
				if (currentChunk) {
					chunks.push(currentChunk)
				}
				currentChunk = para
			}
		}

		if (currentChunk) {
			chunks.push(currentChunk)
		}
	} else {
		// Plain text mode: split directly by length
		let remaining = text
		while (remaining.length > limit) {
			chunks.push(remaining.slice(0, limit))
			remaining = remaining.slice(limit)
		}
		if (remaining) {
			chunks.push(remaining)
		}
	}

	return chunks
}
