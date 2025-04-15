import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'

export interface OpenAICompatCredentials {
	api_key: string
	api_base: string
}

export interface OpenAICompatModelCredentials {
	api_key: string
	endpoint_url?: string
	mode: 'completion' | 'chat'
	context_size: string
	max_tokens_to_sample: string
	vision_support: 'support' | 'no_support'
	voices?: string
	streaming?: boolean
}

export function toCredentialKwargs(credentials: OpenAICompatModelCredentials, model?: string): OpenAIBaseInput & { configuration: ClientOptions } {
	const credentialsKwargs: OpenAIBaseInput = {
		apiKey: credentials.api_key,
		model,
		streaming: credentials.streaming
	} as OpenAIBaseInput
	const configuration: ClientOptions = {}

	if (credentials.endpoint_url) {
		const openaiApiBase = credentials.endpoint_url.replace(/\/$/, '')
		configuration.baseURL = openaiApiBase
	}

	return {
		...credentialsKwargs,
		configuration
	}
}
