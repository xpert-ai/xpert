import { ClientOptions, OpenAIBaseInput } from "@langchain/openai";

export const VLLM = 'vllm';
export const SvgIcon = `<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>vLLM</title><path d="M0 4.973h9.324V23L0 4.973z" fill="#FDB515"></path><path d="M13.986 4.351L22.378 0l-6.216 23H9.324l4.662-18.649z" fill="#30A2FF"></path></svg>`

export type VLLMModelCredentials = {
    api_key: string;
    endpoint_url?: string;
	endpoint_model_name?: string;
	mode?: 'completion' | 'chat';
	context_size?: number;
	max_tokens_to_sample?: number;
	agent_though_support?: 'supported' | 'unsupported';
	function_calling_type?: 'function_call' | 'tool_call' | 'no_call';
	stream_function_calling?: 'supported' | 'unsupported';
	vision_support?: 'supported' | 'unsupported';
	stream_mode_delimiter?: string;
}


export function toCredentialKwargs(credentials: VLLMModelCredentials, model: string) {
    const credentialsKwargs: OpenAIBaseInput = {
		apiKey: credentials.api_key || 'no-key-required',
		model: credentials.endpoint_model_name || model,
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