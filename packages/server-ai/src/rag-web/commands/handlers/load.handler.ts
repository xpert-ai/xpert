import { mapTranslationLanguage, TRagWebResult } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, InternalServerErrorException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Cache } from 'cache-manager'
import { spawn } from 'child_process'
import { I18nService } from 'nestjs-i18n'
import { Providers } from '../../provider'
import { RagWebLoadCommand } from '../load.command'

// Determine the correct command for npx based on the platform
// On Windows, we need to use 'npx.cmd' or set shell: true
const isWindows = process.platform === 'win32'
const npxCommand = isWindows ? 'npx.cmd' : 'npx'

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
				await this.cacheManager.set(key, doc, 5 * 60 * 1000) // https://docs.nestjs.com/v8/techniques/caching#interacting-with-the-cache-store
			}

			const duration = Math.round(((Date.now() - startTime) / 1000) * 100) / 100

			return {
				docs,
				duration
			}
		} catch (err) {
			if (err.message?.includes('playwright install')) {
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
					// Use platform-specific command and ensure PATH is available
					// On Windows, spawn needs shell: true or use .cmd extension
					// On Linux, we also use shell: true to ensure PATH is properly resolved
					const installProcess = spawn(npxCommand, ['playwright', 'install', '--only-shell', 'chromium'], {
						shell: true, // Use shell for both Windows and Linux to ensure PATH resolution
						env: process.env // Ensure PATH and other environment variables are available
					})

					installProcess.stdout.on('data', (data) => {
						console.log(data.toString())
					})

					installProcess.stderr.on('data', (data) => {
						console.error(data.toString())
					})

					// Handle spawn errors (e.g., command not found)
					installProcess.on('error', async (err) => {
						console.error('Failed to spawn playwright install process:', err)
						try {
							await this.cacheManager.set(`${RagWebLoadCommand.providerPrefix}:playwright`, {
								fail: true
							})
						} catch (cacheErr) {
							// Ignore cache errors
						}
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
				// Remove existing timeout if it exists to avoid "Timeout with the given name already exists" warning
				try {
					this.schedulerRegistry.deleteTimeout('install_playwright')
				} catch (err) {
					// Timeout doesn't exist, which is fine
				}
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
