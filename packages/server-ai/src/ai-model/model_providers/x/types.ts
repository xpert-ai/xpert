import { ChatXAIInput } from '@langchain/xai'

export interface XAICredentials {
	api_key: string
	endpoint_url: string
}

export function toCredentialKwargs(credentials: XAICredentials) {
	const credentialsKwargs: ChatXAIInput = {
		apiKey: credentials.api_key
		// baseUrl: credentials.endpoint_url
	}

	return credentialsKwargs
}
