import {
    ModelFeature,
    type ModelExecutionContext,
    type ModelExecutionModel,
    type ModelExecutionPolicy,
    type ModelExecutionProtocol
} from '@xpert-ai/contracts'

export const chatBridgeProtocol = {
    openai_responses: 'openai_responses_chat',
    anthropic_messages: 'anthropic_messages_chat'
} as const

/** Request shape and launcher flags are qualified together; new versions need explicit acceptance. */
export const chatBridgeToolVersions: Readonly<Record<string, readonly string[]>> = {
    codex: ['0.159.2'],
    claude: ['2.1.63']
}

/** Pin native or translated transport at issuance; never retry a failed native request through Chat. */
export function executionToolModels(
    models: ModelExecutionModel[],
    tool: ModelExecutionContext['tool'],
    policy: Extract<ModelExecutionPolicy, { enabled: true }>
): ModelExecutionModel[] {
    if (!policy.tools.some((configured) => configured.id === tool.id && configured.version === tool.version)) return []
    const protocol =
        tool.id === 'codex' ? 'openai_responses' : tool.id === 'claude' ? 'anthropic_messages' : 'openai_chat'
    return models.flatMap((model) => {
        const protocols: ModelExecutionProtocol[] = model.protocols.filter(
            (p) =>
                p === 'openai_chat' ||
                ((p === 'openai_responses' || p === 'anthropic_messages') && policy.nativeProtocols?.includes(p))
        )
        if (
            protocol !== 'openai_chat' &&
            !protocols.includes(protocol) &&
            policy.chatBridgeProtocols?.includes(protocol) &&
            chatBridgeToolVersions[tool.id]?.includes(tool.version) &&
            (tool.id !== 'codex' || model.capabilities.includes(ModelFeature.MULTI_TOOL_CALL)) &&
            protocols.includes('openai_chat') &&
            model.capabilities.includes(ModelFeature.STREAM_TOOL_CALL)
        )
            protocols.push(chatBridgeProtocol[protocol])
        if (
            !protocols.includes(protocol) &&
            (protocol === 'openai_chat' || !protocols.includes(chatBridgeProtocol[protocol]))
        )
            return []
        if (tool.id === 'opencode' && !model.capabilities.includes(ModelFeature.STREAM_TOOL_CALL)) return []
        return [{ ...model, protocols }]
    })
}

export function supportsExecutionTool(model: ModelExecutionModel, tool: string): boolean {
    return tool === 'codex'
        ? model.protocols.some((p) => p === 'openai_responses' || p === 'openai_responses_chat')
        : tool === 'claude'
          ? model.protocols.some((p) => p === 'anthropic_messages' || p === 'anthropic_messages_chat')
          : model.protocols.includes('openai_chat')
}
