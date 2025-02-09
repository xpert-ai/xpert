import { AnthropicInput } from '@langchain/anthropic'
import { CommonChatModelParameters } from '../../llm'

export interface AnthropicCredentials {
    anthropic_api_key: string
    anthropic_api_url: string
}

export type AnthropicModelCredentials = CommonChatModelParameters & {
    streaming?: boolean
	top_p?: number
	max_tokens?: number
	frequency_penalty?: number
}

export function toCredentialKwargs(credentials: AnthropicCredentials): AnthropicInput {

    const input: AnthropicInput = {
        anthropicApiKey: credentials.anthropic_api_key,
        anthropicApiUrl: credentials.anthropic_api_url
    }

    return input
}