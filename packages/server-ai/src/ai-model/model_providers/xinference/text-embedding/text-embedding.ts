import { chunkArray } from '@langchain/core/utils/chunk_array'
import { OpenAIClient, OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TextEmbeddingModelManager } from '../../../types/text-embedding-model'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { toCredentialKwargs, XinferenceCredentials, XinferenceModelCredentials } from '../types'

@Injectable()
export class XinferenceTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		const { copilot } = copilotModel
		const { modelProvider } = copilot

		const params = toCredentialKwargs({
			...(modelProvider.credentials ?? {}),
			...(options?.modelProperties ?? {})
		} as XinferenceModelCredentials)

		return new XinferenceOpenAIEmbeddings({
			...params,
			// batchSize: 512, // Default value if omitted is 512. Max is 2048
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model
		})
	}

	async validateCredentials(model: string, credentials: XinferenceCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as XinferenceModelCredentials)
			const embeddings = new XinferenceOpenAIEmbeddings({
				...params,
				// batchSize: 512, // Default value if omitted is 512. Max is 2048
				model
			})

			// call embedding model
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}

class XinferenceOpenAIEmbeddings extends OpenAIEmbeddings {
	/**
	 * Method to generate embeddings for an array of documents. Splits the
	 * documents into batches and makes requests to the OpenAI API to generate
	 * embeddings.
	 * @param texts Array of documents to generate embeddings for.
	 * @returns Promise that resolves to a 2D array of embeddings for each document.
	 */
	async embedDocuments(texts: string[]) {
		const batches = chunkArray(this.stripNewLines ? texts.map((t) => t.replace(/\n/g, ' ')) : texts, this.batchSize)

		const batchRequests = batches.map((batch) => {
			const params: OpenAIClient.EmbeddingCreateParams = {
				model: this.model,
				input: batch,
				encoding_format: 'float' // ✅ Use 'float' (any value) to skip base64 decoding in OpenAIEmbeddings class, Xinference does not support this parameter
			}
			if (this.dimensions) {
				params.dimensions = this.dimensions
			}
			return this.embeddingWithRetry(params)
		})
		const batchResponses = await Promise.all(batchRequests)

		const embeddings: number[][] = []
		for (let i = 0; i < batchResponses.length; i += 1) {
			const batch = batches[i]
			const { data: batchResponse } = batchResponses[i]
			for (let j = 0; j < batch.length; j += 1) {
				embeddings.push(batchResponse[j].embedding)
			}
		}
		return embeddings
	}
	
	async embedQuery(text: string) {
		const params: OpenAIClient.EmbeddingCreateParams = {
			model: this.model,
			input: this.stripNewLines ? text.replace(/\n/g, ' ') : text,
			encoding_format: 'float' // ✅ Use 'float' (any value) to skip base64 decoding in OpenAIEmbeddings class, Xinference does not support this parameter
		}
		if (this.dimensions) {
			params.dimensions = this.dimensions
		}
		const { data } = await this.embeddingWithRetry(params)
		return data[0].embedding
	}
}
