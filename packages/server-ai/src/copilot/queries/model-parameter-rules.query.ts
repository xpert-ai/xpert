import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

export class ModelParameterRulesQuery implements IQuery {
	static readonly type = '[Copilot] Model parameter rules'

	constructor(
		public readonly provider: string,
		public readonly modelType: AiModelTypeEnum,
		public readonly model: string,
	) {}
}
