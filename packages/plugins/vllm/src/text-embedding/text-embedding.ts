import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { toCredentialKwargs, VLLMModelCredentials } from '../types'
import { CredentialsValidateFailedError, getErrorMessage, TChatModelOptions, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { VLLMProviderStrategy } from '../provider.strategy'

@Injectable()
export class VLLMTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(modelProvider: VLLMProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions): OpenAIEmbeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const params = toCredentialKwargs({
				...(modelProvider.credentials ?? {}),
				...(options?.modelProperties ?? {}),
			} as VLLMModelCredentials,
			copilotModel.model || copilotModel.copilot.copilotModel?.model
		)

		return new OpenAIEmbeddings({
			...params,
			// batchSize: 512, // Default value if omitted is 512. Max is 2048
		})
	}

	async validateCredentials(model: string, credentials: VLLMModelCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as VLLMModelCredentials, model)
			const embeddings = new OpenAIEmbeddings({
				...params,
				// batchSize: 512, // Default value if omitted is 512. Max is 2048
			})

			// call embedding model
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}
