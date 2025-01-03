import { OpenAICompatModelCredentials } from "../openai_api_compatible/types"

export const OpenRouterAiBaseUrl = 'https://openrouter.ai/api/v1'

export type OpenRouterCredentials = {
	api_key: string
}

export type OpenRouterModelCredentials = OpenAICompatModelCredentials & {
	//
}
