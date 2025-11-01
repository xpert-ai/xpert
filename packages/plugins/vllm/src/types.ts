import { ClientOptions, OpenAIBaseInput } from "@langchain/openai";

export const VLLM = 'vllm';
export const SvgIcon = `<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>vLLM</title><path d="M0 4.973h9.324V23L0 4.973z" fill="#FDB515"></path><path d="M13.986 4.351L22.378 0l-6.216 23H9.324l4.662-18.649z" fill="#30A2FF"></path></svg>`

export type VLLMModelCredentials = {
    apiKey: string;
    apiHost?: string;
}


export function toCredentialKwargs(credentials: VLLMModelCredentials) {
    const credentialsKwargs: OpenAIBaseInput = {
		apiKey: credentials.apiKey,
	} as OpenAIBaseInput
	const configuration: ClientOptions = {}

	if (credentials.apiHost) {
		const openaiApiBase = credentials.apiHost.replace(/\/$/, '')
		configuration.baseURL = openaiApiBase
	}

	return {
		...credentialsKwargs,
		configuration
	}
}