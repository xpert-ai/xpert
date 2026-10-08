import type {
    ModelExecutionContext,
    ModelExecutionModel,
    ModelExecutionPolicy,
    ModelExecutionProtocol
} from '@xpert-ai/contracts'
import type { CliModelProfiles } from '@xpert-ai/plugin-sdk'
import { builtinCliModelProfiles } from '@xpert-ai/cli-model-profiles'

export const chatBridgeProtocol = {
    openai_responses: 'openai_responses_chat',
    anthropic_messages: 'anthropic_messages_chat'
} as const

/** Protocol negotiation is independent of CLI names and provider identities. */
export function executionToolModels(
    models: ModelExecutionModel[],
    tool: ModelExecutionContext['tool'],
    policy: Extract<ModelExecutionPolicy, { enabled: true }>,
    profiles: CliModelProfiles = builtinCliModelProfiles
): ModelExecutionModel[] {
    const profile = profiles.get(tool.id)
    if (!profile || !policy.tools.some((item) => item.id === tool.id && item.version === tool.version)) return []
    return models.flatMap((model) => {
        if (!profile.requiredCapabilities.every((capability) => model.capabilities.includes(capability))) return []
        const protocols: ModelExecutionProtocol[] = model.protocols.filter(
            (p) =>
                p === 'openai_chat' ||
                ((p === 'openai_responses' || p === 'anthropic_messages') && policy.nativeProtocols?.includes(p))
        )
        const protocol = profile.protocol
        if (
            protocol !== 'openai_chat' &&
            !protocols.includes(protocol) &&
            policy.chatBridgeProtocols?.includes(protocol) &&
            profile.chatBridge?.versions.includes(tool.version) &&
            protocols.includes('openai_chat') &&
            profile.chatBridge.requiredCapabilities.every((capability) => model.capabilities.includes(capability))
        ) {
            protocols.push(chatBridgeProtocol[protocol])
        }
        const qualified = { ...model, protocols }
        return supportsExecutionTool(qualified, tool.id, profiles) ? [qualified] : []
    })
}

export function supportsExecutionTool(
    model: ModelExecutionModel,
    tool: string,
    profiles: CliModelProfiles = builtinCliModelProfiles
): boolean {
    const profile = profiles.get(tool)
    return (
        !!profile &&
        (model.protocols.includes(profile.protocol) ||
            (profile.protocol !== 'openai_chat' && model.protocols.includes(chatBridgeProtocol[profile.protocol])))
    )
}
