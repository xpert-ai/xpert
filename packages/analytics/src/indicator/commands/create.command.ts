import { DeepPartial } from '@xpert-ai/server-common'
import { ICommand } from '@nestjs/cqrs'
import { Indicator } from '../indicator.entity'

export class IndicatorCreateCommand implements ICommand {
	static readonly type = '[Indicator] Create'

	constructor(public readonly input: DeepPartial<Indicator>) {}
}
