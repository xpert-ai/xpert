import { AnthropicInput } from '@langchain/anthropic'

export interface AnthropicCredentials {
    anthropic_api_key: string
    anthropic_api_url: string
}

export function toCredentialKwargs(credentials: AnthropicCredentials): AnthropicInput {

    const input: AnthropicInput = {
        anthropicApiKey: credentials.anthropic_api_key,
        anthropicApiUrl: credentials.anthropic_api_url
    }

    return input
}