import { TRagWebResult } from '@metad/contracts'
import { CACHE_MANAGER, Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { Providers } from '../../provider'
import { RagWebLoadCommand } from '../load.command'

@CommandHandler(RagWebLoadCommand)
export class RagWebLoadHandler implements ICommandHandler<RagWebLoadCommand> {
	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	public async execute(command: RagWebLoadCommand): Promise<TRagWebResult> {
		const { type, input } = command
		const { webOptions, integration } = input

		const startTime = Date.now()

		const docs = await Providers[type]?.load(webOptions, integration)

		// Save docs to cache
		for await (const doc of docs) {
			const key = `${RagWebLoadCommand.prefix}:${doc.metadata.scrapeId}`
			await this.cacheManager.set(key, doc, 1000 * 60 * 60)
		}

		const duration = Math.round(((Date.now() - startTime) / 1000) * 100) / 100

		return {
			docs,
			duration
		}
	}
}
