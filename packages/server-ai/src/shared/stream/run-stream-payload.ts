import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import type { IChatMessage, IXpertAgentExecution } from '@xpert-ai/contracts'
import { Exclude, Expose, instanceToPlain } from 'class-transformer'

export type StreamPayloadWithObjectData = object & {
    data: object
}

@Exclude()
export class ChatMessageEndStreamDTO {
    @Expose()
    id?: IChatMessage['id']

    @Expose()
    conversationId?: IChatMessage['conversationId']

    @Expose()
    executionId?: IChatMessage['executionId']

    @Expose()
    role?: IChatMessage['role']

    @Expose()
    status?: IChatMessage['status']

    @Expose()
    error?: IChatMessage['error']

    constructor(partial: object) {
        Object.assign(this, partial)
    }
}

@Exclude()
export class AgentEndStreamDTO {
    @Expose()
    id?: IXpertAgentExecution['id']

    @Expose()
    agentKey?: IXpertAgentExecution['agentKey']

    @Expose()
    status?: IXpertAgentExecution['status']

    @Expose()
    error?: IXpertAgentExecution['error']

    @Expose()
    elapsedTime?: IXpertAgentExecution['elapsedTime']

    @Expose()
    tokens?: IXpertAgentExecution['tokens']

    @Expose()
    totalTokens?: IXpertAgentExecution['totalTokens']

    @Expose()
    embedTokens?: IXpertAgentExecution['embedTokens']

    @Expose()
    inputTokens?: IXpertAgentExecution['inputTokens']

    @Expose()
    outputTokens?: IXpertAgentExecution['outputTokens']

    @Expose()
    totalPrice?: IXpertAgentExecution['totalPrice']

    @Expose()
    currency?: IXpertAgentExecution['currency']

    @Expose()
    metadata?: IXpertAgentExecution['metadata']

    @Expose()
    responseLatency?: IXpertAgentExecution['responseLatency']

    @Expose()
    parentId?: IXpertAgentExecution['parentId']

    @Expose()
    xpertId?: IXpertAgentExecution['xpertId']

    constructor(partial: object) {
        Object.assign(this, partial)
    }
}

function isObjectLike(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNilValue(value: unknown) {
    return value === null || value === undefined
}

export function hasObjectData(value: unknown): value is StreamPayloadWithObjectData {
    return isObjectLike(value) && 'data' in value && isObjectLike(value.data)
}

function isChatEventPayload(value: unknown): value is object & { type: ChatMessageTypeEnum.EVENT; event: string } {
    return (
        isObjectLike(value) &&
        'type' in value &&
        value.type === ChatMessageTypeEnum.EVENT &&
        'event' in value &&
        typeof value.event === 'string'
    )
}

export function getChatEventName(data: unknown) {
    if (!isChatEventPayload(data)) {
        return null
    }

    return data.event
}

export function isControlledRunStreamEvent(data: unknown) {
    const eventName = getChatEventName(data)

    return eventName === ChatMessageEventTypeEnum.ON_MESSAGE_END || eventName === ChatMessageEventTypeEnum.ON_AGENT_END
}

function removeNilProperties(value: object) {
    return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => !isNilValue(entryValue)))
}

function toPlainObject(value: object) {
    const plain = instanceToPlain(value)

    return isObjectLike(plain) ? removeNilProperties(plain) : plain
}

function serializeEventData(eventName: string, data: object) {
    switch (eventName) {
        case ChatMessageEventTypeEnum.ON_MESSAGE_END:
            return toPlainObject(new ChatMessageEndStreamDTO(data))
        case ChatMessageEventTypeEnum.ON_AGENT_END:
            return toPlainObject(new AgentEndStreamDTO(data))
        default:
            return removeNilProperties(data)
    }
}

export function serializeRunStreamPayload(payload: unknown) {
    if (!hasObjectData(payload)) {
        return payload
    }

    const eventName = getChatEventName(payload)
    const data = eventName ? serializeEventData(eventName, payload.data) : removeNilProperties(payload.data)

    return {
        ...payload,
        data
    }
}
