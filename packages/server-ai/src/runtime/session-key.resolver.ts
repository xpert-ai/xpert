import { Injectable } from '@nestjs/common'

/**
 * SessionKeyResolver - Generates consistent session keys for run tracking
 *
 * Session keys are used to group related runs for serial execution
 * and batch cancellation.
 */
@Injectable()
export class SessionKeyResolver {
	/**
	 * Resolve session key for chat/xpert context
	 *
	 * Priority:
	 * 1. conversationId exists: `chat:conversation:<conversationId>`
	 * 2. xpert + end user: `xpert:<xpertId>:enduser:<fromEndUserId>`
	 * 3. xpert + user: `xpert:<xpertId>:user:<userId>`
	 * 4. websocket fallback: `chat:ws:<socketId>`
	 */
	resolveForChat(context: {
		conversationId?: string
		xpertId?: string
		userId?: string
		fromEndUserId?: string
		socketId?: string
	}): string {
		const { conversationId, xpertId, userId, fromEndUserId, socketId } = context

		if (conversationId) {
			return `chat:conversation:${conversationId}`
		}

		if (xpertId) {
			if (fromEndUserId) {
				return `xpert:${xpertId}:enduser:${fromEndUserId}`
			}
			if (userId) {
				return `xpert:${xpertId}:user:${userId}`
			}
		}

		if (socketId) {
			return `chat:ws:${socketId}`
		}

		// Fallback to random key (no grouping)
		return `chat:anonymous:${Date.now()}`
	}

	/**
	 * Resolve session key for Lark channel
	 *
	 * Format: `channel:lark:integration:<integrationId>:chat:<chatId>:user:<userId>`
	 */
	resolveForLark(context: {
		integrationId: string
		chatId: string
		userId: string
	}): string {
		const { integrationId, chatId, userId } = context
		return `channel:lark:integration:${integrationId}:chat:${chatId}:user:${userId}`
	}

	/**
	 * Resolve session key for analytics
	 *
	 * Format: `analytics:ws:<sessionId>`
	 * Optional: `analytics:ws:<sessionId>:model:<modelId>` for finer granularity
	 */
	resolveForAnalytics(context: {
		sessionId: string
		modelId?: string
	}): string {
		const { sessionId, modelId } = context

		if (modelId) {
			return `analytics:ws:${sessionId}:model:${modelId}`
		}

		return `analytics:ws:${sessionId}`
	}

	/**
	 * Resolve session key for API calls
	 *
	 * Format: `api:tenant:<tenantId>:user:<userId>:req:<requestId>`
	 */
	resolveForApi(context: {
		tenantId: string
		userId: string
		requestId: string
	}): string {
		const { tenantId, userId, requestId } = context
		return `api:tenant:${tenantId}:user:${userId}:req:${requestId}`
	}

	/**
	 * Parse session key to extract components
	 */
	parseSessionKey(sessionKey: string): {
		type: 'chat' | 'xpert' | 'channel' | 'analytics' | 'api' | 'unknown'
		parts: Record<string, string>
	} {
		const parts: Record<string, string> = {}
		const segments = sessionKey.split(':')

		if (segments[0] === 'chat') {
			if (segments[1] === 'conversation') {
				parts.conversationId = segments[2]
				return { type: 'chat', parts }
			}
			if (segments[1] === 'ws') {
				parts.socketId = segments[2]
				return { type: 'chat', parts }
			}
		}

		if (segments[0] === 'xpert') {
			parts.xpertId = segments[1]
			if (segments[2] === 'enduser') {
				parts.fromEndUserId = segments[3]
			} else if (segments[2] === 'user') {
				parts.userId = segments[3]
			}
			return { type: 'xpert', parts }
		}

		if (segments[0] === 'channel') {
			parts.channelType = segments[1]
			// Parse lark format
			for (let i = 2; i < segments.length - 1; i += 2) {
				parts[segments[i]] = segments[i + 1]
			}
			return { type: 'channel', parts }
		}

		if (segments[0] === 'analytics') {
			parts.sessionId = segments[2]
			if (segments[3] === 'model') {
				parts.modelId = segments[4]
			}
			return { type: 'analytics', parts }
		}

		if (segments[0] === 'api') {
			for (let i = 1; i < segments.length - 1; i += 2) {
				parts[segments[i]] = segments[i + 1]
			}
			return { type: 'api', parts }
		}

		return { type: 'unknown', parts: { raw: sessionKey } }
	}
}
