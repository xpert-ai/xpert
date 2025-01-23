import { ClientOptions, OpenAIBaseInput } from "@langchain/openai"

export interface DeepseekCredentials {
    api_key: string
    endpoint_url: string
}

export interface DeepseekModelCredentials {
    streaming?: boolean
    temperature: number
    top_p?: number
    max_tokens?: number
    frequency_penalty?: number
}

export function toCredentialKwargs(credentials: DeepseekCredentials) {
    const credentialsKwargs: OpenAIBaseInput = {
        apiKey: credentials.api_key
    } as OpenAIBaseInput
    const configuration: ClientOptions = {}

    if (credentials.endpoint_url) {
        const openaiApiBase = credentials.endpoint_url.replace(/\/$/, '').replace(/\/v1$/, '')
        configuration.baseURL = `${openaiApiBase}/v1`
    } else {
        configuration.baseURL = `https://api.deepseek.com/v1`
    }

    return {
        ...credentialsKwargs,
        configuration
    }
}