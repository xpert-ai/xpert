import { GoogleGenerativeAIChatInput } from '@langchain/google-genai'

export interface GoogleCredentials {
	google_api_key: string
	google_base_url: string
}

export function toCredentialKwargs(credentials: GoogleCredentials) {
	const credentialsKwargs: GoogleGenerativeAIChatInput = {
		apiKey: credentials.google_api_key,
		baseUrl: credentials.google_base_url
	}

	return credentialsKwargs
}
