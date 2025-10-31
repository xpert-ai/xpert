import { ClientOptions, OpenAIBaseInput } from "@langchain/openai"

export const Volcengine = 'volcengine'
export const SvgIcon = ``

export type VolcengineModelCredentials = {
    volc_api_key?: string
    volc_access_key_id?: string
    volc_secret_access_key?: string
    endpoint_id?: string
    api_endpoint_host?: string
}

export function toCredentialKwargs(credentials: VolcengineModelCredentials) {
    const credentialsKwargs: OpenAIBaseInput = {
		apiKey: credentials.volc_api_key,
		model: credentials.endpoint_id,
	} as OpenAIBaseInput
	const configuration: ClientOptions = {}

	if (credentials.api_endpoint_host) {
		const openaiApiBase = credentials.api_endpoint_host.replace(/\/$/, '')
		configuration.baseURL = openaiApiBase
	}

	return {
		...credentialsKwargs,
		configuration
	}
}