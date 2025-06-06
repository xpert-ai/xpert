import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import fs from 'fs'
import * as fsp from 'fs/promises'
import path from 'path'
import { pipeline } from 'stream/promises'
import unzipper from 'unzipper'
import { FileStorage, RequestContext } from '../../../core'
import { StorageFileService } from '../../storage-file.service'
import { DeployWebappCommand } from '../deploy-webapp.command'

@CommandHandler(DeployWebappCommand)
export class DeployWebappHandler implements ICommandHandler<DeployWebappCommand> {
	constructor(
		private readonly fileService: StorageFileService,
		private readonly _commandBus: CommandBus
	) {}

	public async execute(command: DeployWebappCommand): Promise<string> {
		const { stream, appId } = command

		const tenantId = RequestContext.currentTenantId()
		const provider = new FileStorage().getProvider()

		// Temporary file path
		const tempZipPath = path.resolve(provider.config.rootPath, '/tmp', `webapp-${tenantId}-${Date.now()}.zip`)
		const extractDir = path.resolve(provider.config.rootPath, 'webapp', appId)

		try {
			// Save the zip stream as a local temporary file
			await pipeline(stream, fs.createWriteStream(tempZipPath))

			// Make sure the decompression directory exists
			await fsp.mkdir(extractDir, { recursive: true })

			// Unzip the zip file to the specified directory
			await fs
				.createReadStream(tempZipPath)
				.pipe(unzipper.Extract({ path: extractDir }))
				.promise()

			return provider.config.baseUrl + `/webapp/${appId}/index.html`
		} catch (err) {
			console.error(err)
		} finally {
			// Cleaning up temporary files
			await fsp.unlink(tempZipPath)
		}
	}
}
