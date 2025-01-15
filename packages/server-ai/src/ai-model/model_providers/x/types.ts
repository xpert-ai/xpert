import { ChatOpenAIFields } from '@langchain/openai'
import { ChatXAIInput } from '@langchain/xai'

export interface XAICredentials {
	api_key: string
	endpoint_url: string
}

export function toCredentialKwargs(credentials: XAICredentials) {
	const credentialsKwargs: ChatOpenAIFields = {
		apiKey: credentials.api_key,
		configuration: {
			baseURL: credentials.endpoint_url
		}
	}

	return credentialsKwargs
}
