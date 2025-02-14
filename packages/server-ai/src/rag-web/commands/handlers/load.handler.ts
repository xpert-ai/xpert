import { TRagWebResult } from '@metad/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Providers } from '../../provider'
import { RagWebLoadCommand } from '../load.command'

@CommandHandler(RagWebLoadCommand)
export class RagWebLoadHandler implements ICommandHandler<RagWebLoadCommand> {
	constructor() {}

	public async execute(command: RagWebLoadCommand): Promise<TRagWebResult> {
		const { type, input } = command
		const { webOptions, integration } = input

		const startTime = Date.now()

		const docs = await Providers[type]?.load(webOptions, integration)

		const duration = Math.round(((Date.now() - startTime) / 1000) * 100) / 100

		return {
			docs,
			duration
		}
	}
}
