import type { XpertEventCreateInput, XpertEventMeta, XpertEventScope, XpertEventSource } from './event.model'
import { XPERT_EVENT_TYPES } from './event-types'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '../ai'

export interface XpertChatStreamMessage {
	data?: unknown
}

export interface XpertChatEventBridgeContext extends XpertEventScope {
	source?: XpertEventSource
	sourceId?: string
	meta?: XpertEventMeta
}

export function mapChatMessageToXpertEvent(
	message: XpertChatStreamMessage,
	context: XpertChatEventBridgeContext = {}
): XpertEventCreateInput | null {
	const data = readObjectProperty(message, 'data')
	if (!data) {
		return null
	}

	const messageType = readStringProperty(data, 'type')
	if (messageType === ChatMessageTypeEnum.MESSAGE) {
		return createChatEventInput(XPERT_EVENT_TYPES.ChatMessageDelta, context, readUnknownProperty(data, 'data'))
	}

	if (messageType !== ChatMessageTypeEnum.EVENT) {
		return null
	}

	const legacyEvent = readStringProperty(data, 'event')
	const payload = readUnknownProperty(data, 'data')
	const scope = resolveEventScope(context, legacyEvent, payload)

	switch (legacyEvent) {
		case ChatMessageEventTypeEnum.ON_CONVERSATION_START:
			return createChatEventInput(XPERT_EVENT_TYPES.ChatConversationStarted, { ...context, ...scope }, payload)
		case ChatMessageEventTypeEnum.ON_MESSAGE_START:
			return createChatEventInput(XPERT_EVENT_TYPES.ChatMessageStarted, { ...context, ...scope }, payload)
		case ChatMessageEventTypeEnum.ON_MESSAGE_END:
			return createChatEventInput(XPERT_EVENT_TYPES.ChatMessageEnded, { ...context, ...scope }, payload)
		case ChatMessageEventTypeEnum.ON_AGENT_START:
			return createChatEventInput(XPERT_EVENT_TYPES.AgentExecutionStarted, { ...context, ...scope }, payload)
		case ChatMessageEventTypeEnum.ON_AGENT_END:
			return createChatEventInput(XPERT_EVENT_TYPES.AgentExecutionEnded, { ...context, ...scope }, payload)
		case ChatMessageEventTypeEnum.ON_INTERRUPT:
			return createChatEventInput(XPERT_EVENT_TYPES.AgentInterrupted, { ...context, ...scope }, payload)
		case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE:
			return createChatEventInput(XPERT_EVENT_TYPES.ToolMessage, { ...context, ...scope }, payload)
		case ChatMessageEventTypeEnum.ON_TOOL_ERROR:
			return createChatEventInput(XPERT_EVENT_TYPES.ToolFailed, { ...context, ...scope }, payload)
		case ChatMessageEventTypeEnum.ON_CHAT_EVENT:
			return createChatEventInput(XPERT_EVENT_TYPES.ChatEvent, { ...context, ...scope }, payload)
		default:
			return createChatEventInput(XPERT_EVENT_TYPES.ChatEvent, { ...context, ...scope }, {
				legacyEvent,
				data: payload
			})
	}
}

function createChatEventInput(
	type: string,
	context: XpertChatEventBridgeContext,
	payload: unknown
): XpertEventCreateInput {
	return {
		type,
		scope: compactScope({
			projectId: context.projectId,
			sprintId: context.sprintId,
			taskId: context.taskId,
			taskExecutionId: context.taskExecutionId,
			conversationId: context.conversationId,
			agentExecutionId: context.agentExecutionId,
			xpertId: context.xpertId
		}),
		source: context.source ?? {
			type: 'chat',
			id: context.sourceId ?? context.conversationId ?? context.agentExecutionId ?? 'chat'
		},
		payload,
		meta: context.meta
	}
}

function resolveEventScope(
	context: XpertChatEventBridgeContext,
	legacyEvent: string | undefined,
	payload: unknown
): XpertEventScope {
	const scope: XpertEventScope = {}
	if (legacyEvent === ChatMessageEventTypeEnum.ON_CONVERSATION_START) {
		scope.conversationId = readStringProperty(payload, 'id') ?? context.conversationId
	}
	if (legacyEvent === ChatMessageEventTypeEnum.ON_MESSAGE_START) {
		scope.agentExecutionId = readStringProperty(payload, 'executionId') ?? context.agentExecutionId
	}
	if (
		legacyEvent === ChatMessageEventTypeEnum.ON_AGENT_START ||
		legacyEvent === ChatMessageEventTypeEnum.ON_AGENT_END
	) {
		scope.agentExecutionId = readStringProperty(payload, 'id') ?? context.agentExecutionId
	}
	return compactScope(scope)
}

function compactScope(scope: XpertEventScope): XpertEventScope {
	const compacted: XpertEventScope = {}
	for (const key of Object.keys(scope) as Array<keyof XpertEventScope>) {
		const value = scope[key]
		if (typeof value === 'string' && value.trim()) {
			compacted[key] = value
		}
	}
	return compacted
}

function readObjectProperty<TProperty extends string>(value: unknown, property: TProperty) {
	if (typeof value !== 'object' || value === null || !(property in value)) {
		return undefined
	}
	const propertyValue = (value as { [K in TProperty]?: unknown })[property]
	return typeof propertyValue === 'object' && propertyValue !== null ? propertyValue : undefined
}

function readStringProperty<TProperty extends string>(value: unknown, property: TProperty) {
	if (typeof value !== 'object' || value === null || !(property in value)) {
		return undefined
	}
	const propertyValue = (value as { [K in TProperty]?: unknown })[property]
	return typeof propertyValue === 'string' && propertyValue.trim() ? propertyValue : undefined
}

function readUnknownProperty<TProperty extends string>(value: unknown, property: TProperty) {
	if (typeof value !== 'object' || value === null || !(property in value)) {
		return undefined
	}
	return (value as { [K in TProperty]?: unknown })[property]
}
