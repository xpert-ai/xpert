import { ClientOptions, OpenAIBaseInput } from "@langchain/openai"
import { CommonChatModelParameters } from "../../llm"

export interface TongyiCredentials {
    dashscope_api_key: string
}

export interface QWenModelCredentials extends CommonChatModelParameters {
    streaming?: boolean
	top_p?: number
	max_tokens?: number
	frequency_penalty?: number
}

export function toCredentialKwargs(credentials: TongyiCredentials) {
	const credentialsKwargs: OpenAIBaseInput = {
		apiKey: credentials.dashscope_api_key
	} as OpenAIBaseInput
	const configuration: ClientOptions = {baseURL: `https://dashscope.aliyuncs.com/compatible-mode/v1`}

	return {
		...credentialsKwargs,
		configuration
	}
}
