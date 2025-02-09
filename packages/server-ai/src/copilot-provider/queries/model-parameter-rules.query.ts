import { AiModelTypeEnum } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Get parameter schema for ai provider's model
 */
export class CopilotProviderModelParameterRulesQuery implements IQuery {
	static readonly type = '[Copilot Provider] Model parameter rules'

	constructor(
		public readonly providerId: string,
		public readonly modelType: AiModelTypeEnum,
		public readonly model: string,
	) {}
}
