import type { ModelGatewayUsage } from './model-gateway.service'
import type { OpenAIResponseToolCall } from './openai-adapter'

export interface GatewayChatBase {
    id: string
    created: number
    model: string
}
export interface GatewayChatToolDelta {
    index: number
    id?: string
    type: 'function'
    function: { name?: string; arguments: string }
}
/** Protocol writers only format output. Admission, provider invocation and settlement stay in the executor. */
export interface GatewayChatWriter {
    start(base: GatewayChatBase): Promise<void>
    delta(text: string, tools: GatewayChatToolDelta[]): Promise<void>
    complete(input: {
        base: GatewayChatBase
        text: string
        tools?: OpenAIResponseToolCall[]
        reason: string
        usage: ModelGatewayUsage
    }): Promise<void>
    fail(): Promise<void>
}
