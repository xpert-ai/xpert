import { AiModelTypeEnum } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

export class CopilotProviderModelParameterRulesQuery implements IQuery {
	static readonly type = '[Copilot Provider] Model parameter rules'

	constructor(
		public readonly providerId: string,
		public readonly modelType: AiModelTypeEnum,
		public readonly model: string,
	) {}
}
