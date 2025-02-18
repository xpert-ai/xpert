import { mapTranslationLanguage, TRagWebResult } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CACHE_MANAGER, Inject, InternalServerErrorException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Cache } from 'cache-manager'
import { spawn } from 'child_process'
import { I18nService } from 'nestjs-i18n'
import { Providers } from '../../provider'
import { RagWebLoadCommand } from '../load.command'

@CommandHandler(RagWebLoadCommand)
export class RagWebLoadHandler implements ICommandHandler<RagWebLoadCommand> {
	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly i18nService: I18nService,

	) {}

	public async execute(command: RagWebLoadCommand): Promise<TRagWebResult> {
		const { type, input } = command
		const { webOptions, integration } = input

		const startTime = Date.now()

		try {
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
		} catch (err) {
			if (err.message?.includes('yarn playwright install')) {
				const result = await this.cacheManager.get<{ installing: boolean; fail?: boolean; }>(
					`${RagWebLoadCommand.providerPrefix}:playwright`
				)
				if (result?.installing) {
					throw new InternalServerErrorException(
						await this.i18nService.t('rag.Error.InstallingPlaywright', {
							lang: mapTranslationLanguage(RequestContext.getLanguageCode())
						}))
				}
				await this.cacheManager.set(`${RagWebLoadCommand.providerPrefix}:playwright`, { installing: true })
				const callback = () => {
					const installProcess = spawn('npx', ['playwright', 'install'])

					installProcess.stdout.on('data', (data) => {
						console.log(data.toString())
					})

					installProcess.stderr.on('data', (data) => {
						console.error(data.toString())
					})

					installProcess.on('close', async (code) => {
						try {
							if (code === 0) {
								await this.cacheManager.set(`${RagWebLoadCommand.providerPrefix}:playwright`, {
									installed: true
								})
							} else {
								await this.cacheManager.set(`${RagWebLoadCommand.providerPrefix}:playwright`, {
									fail: true
								})
							}
						} catch (err) {
							//
						}
					})
				}

				const timeout = setTimeout(callback, 100)
				this.schedulerRegistry.addTimeout('install_playwright', timeout)

				if (result?.fail) {
					throw new InternalServerErrorException(
						await this.i18nService.t('rag.Error.ErrorReinstallPlaywright', {
							lang: mapTranslationLanguage(RequestContext.getLanguageCode())
						}))
				}

				throw new InternalServerErrorException(
					await this.i18nService.t('rag.Error.PlaywrightNotInstalled', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					}))
			}

			throw new InternalServerErrorException(err.message)
		}
	}
}
