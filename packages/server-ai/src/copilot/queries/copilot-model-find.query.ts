import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

export class FindCopilotModelsQuery implements IQuery {
	static readonly type = '[Copilot] Find Models'

	constructor(public readonly type: AiModelTypeEnum) {}
}
