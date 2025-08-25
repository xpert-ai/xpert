import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '../../llm'

export interface ZhipuaiCredentials {
	api_key: string
}

export interface ZhipuaiModelOptions extends CommonChatModelParameters {
	streaming?: boolean
	top_p?: number
	max_tokens?: number
	frequency_penalty?: number
	do_sample?: boolean
	thinking?: boolean
	web_search?: boolean
	response_format?: 'text' | 'json_object'
}

export interface ZhipuaiTextEmbeddingModelOptions {
	context_size: number
	max_chunks: number
}

export function toCredentialKwargs(credentials: ZhipuaiCredentials) {
	const credentialsKwargs = {
		apiKey: credentials.api_key,
		zhipuAIApiKey: credentials.api_key
	} as OpenAIBaseInput & { zhipuAIApiKey: string }
	const configuration: ClientOptions = { baseURL: `https://open.bigmodel.cn/api/paas/v4` }

	return {
		...credentialsKwargs,
		configuration
	}
}
