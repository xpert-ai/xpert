import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TextEmbeddingModelManager } from '../../../types/text-embedding-model'
import { CredentialsValidateFailedError } from '../../errors'
import { toCredentialKwargs, TongyiCredentials } from '../types'

@Injectable()
export class TongyiTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel): OpenAIEmbeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const params = toCredentialKwargs(modelProvider.credentials as TongyiCredentials)

		return new OpenAIEmbeddings({
			...params,
			// batchSize: 512, // Default value if omitted is 512. Max is 2048
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model,
		})
	}

	async validateCredentials(model: string, credentials: TongyiCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as TongyiCredentials)
			const embeddings = new OpenAIEmbeddings({
				...params,
				// batchSize: 512, // Default value if omitted is 512. Max is 2048
				model,
			})

			// call embedding model
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}
