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
	/**
	 * 是否开启思考模式，适用于 Qwen3 模型。
	 * Qwen3 商业版模型默认值为 False，Qwen3 开源版模型默认值为 True。
	 */
	enable_thinking?: boolean
	/**
	 * 思考过程的最大长度，只在enable_thinking为true时生效。适用于 Qwen3 的商业版与开源版模型。
	 */
	thinking_budget?: number
	/**
	 * 模型在生成文本时是否使用互联网搜索结果进行参考。取值如下：
	 *	true：启用互联网搜索，模型会将搜索结果作为文本生成过程中的参考信息，但模型会基于其内部逻辑判断是否使用互联网搜索结果。
	 *        如果模型没有搜索互联网，建议优化Prompt，或设置search_options中的forced_search参数开启强制搜索。
	 * false（默认）：关闭互联网搜索。
	 */
	enable_search?: boolean
}

export interface TongyiTextEmbeddingModelOptions {
	context_size: number
    max_chunks: number
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
