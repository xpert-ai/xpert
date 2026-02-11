import { Injectable } from '@nestjs/common'

@Injectable()
export class SessionKeyResolver {
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

		return `chat:anonymous:${Date.now()}`
	}

	resolveForLark(context: {
		integrationId: string
		chatId: string
		userId: string
	}): string {
		const { integrationId, chatId, userId } = context
		return `channel:lark:integration:${integrationId}:chat:${chatId}:user:${userId}`
	}

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

	resolveForSubagent(context: {
		threadId: string
		agentKey: string
		executionId: string
	}): string {
		const { threadId, agentKey, executionId } = context
		return `subagent:${threadId}:${agentKey}:${executionId}`
	}

	resolveForApi(context: {
		tenantId: string
		userId: string
		requestId: string
	}): string {
		const { tenantId, userId, requestId } = context
		return `api:tenant:${tenantId}:user:${userId}:req:${requestId}`
	}

	parseSessionKey(sessionKey: string): {
		type: 'chat' | 'xpert' | 'subagent' | 'channel' | 'analytics' | 'api' | 'unknown'
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

		if (segments[0] === 'subagent') {
			parts.threadId = segments[1]
			parts.agentKey = segments[2]
			parts.executionId = segments[3]
			return { type: 'subagent', parts }
		}

		if (segments[0] === 'channel') {
			parts.channelType = segments[1]
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
