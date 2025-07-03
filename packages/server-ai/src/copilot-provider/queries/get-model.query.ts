import { AiModelTypeEnum } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 */
export class GetCopilotProviderModelQuery implements IQuery {
	static readonly type = '[Copilot Provider Model] Get One'

	constructor(
		public readonly providerId: string,
		public readonly params: {
			modelName?: string
			modelType?: AiModelTypeEnum
		}
	) {}
}
