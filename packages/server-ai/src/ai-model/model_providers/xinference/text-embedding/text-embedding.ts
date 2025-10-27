import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TextEmbeddingModelManager } from '../../../types/text-embedding-model'
import { CredentialsValidateFailedError } from '../../errors'
import { toCredentialKwargs, XinferenceCredentials, XinferenceModelCredentials } from '../types'
import { TChatModelOptions } from '../../../types/types'

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
	async embedQuery(text: string) {
		const params: {model: string; input: string; dimensions?: number; encoding_format: 'float' | 'base64'} = {
			model: this.model,
			input: this.stripNewLines ? text.replace(/\n/g, " ") : text,
			encoding_format: 'float' // Use 'float' (any value) to skip base64 decoding in OpenAIEmbeddings class, Xinference does not support this parameter
		};
		if (this.dimensions) {
			params.dimensions = this.dimensions;
		}
		const { data } = await this.embeddingWithRetry(params);
		return data[0].embedding;
	}
}
