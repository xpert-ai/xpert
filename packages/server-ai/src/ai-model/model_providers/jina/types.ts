import { JinaEmbeddingsParams } from '@langchain/community/embeddings/jina'

export interface JinaCredentials {
	api_key: string
}

export interface JinaModelCredentials extends JinaCredentials {
	base_url?: string
	context_size?: number
}

export function toCredentialKwargs(credentials: JinaModelCredentials): Partial<JinaEmbeddingsParams> {
	return {
		apiKey: credentials.api_key,
		baseUrl: credentials.base_url
	} as Partial<JinaEmbeddingsParams>
}
