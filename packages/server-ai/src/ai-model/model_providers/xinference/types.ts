import { ClientOptions, OpenAIBaseInput } from "@langchain/openai"
import { CommonChatModelParameters } from "../../llm"

export interface XinferenceCredentials {
    api_key: string
	server_url: string
}

export interface XinferenceModelCredentials extends XinferenceCredentials, CommonChatModelParameters {
	invoke_timeout: number
	max_retries: number
	model_uid?: string

    streaming?: boolean
	top_p?: number
	max_tokens?: number
	frequency_penalty?: number
}

export function toCredentialKwargs(credentials: XinferenceModelCredentials) {
	const credentialsKwargs: OpenAIBaseInput = {
		apiKey: credentials.api_key
	} as OpenAIBaseInput
	const configuration: ClientOptions = {baseURL: credentials.server_url}

	return {
		...credentialsKwargs,
		configuration
	}
}
