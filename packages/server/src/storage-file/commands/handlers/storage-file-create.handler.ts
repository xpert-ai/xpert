import { IStorageFile } from '@xpert-ai/contracts'
import { BadRequestException, HttpException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import * as fsp from 'fs/promises'
import moment from 'moment'
import { dirname, join, resolve } from 'path'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FileStorage } from '../../../file'
import { StorageFileService } from '../../storage-file.service'
import { StorageFileCreateCommand } from '../storage-file-create.command'

@CommandHandler(StorageFileCreateCommand)
export class StorageFileCreateHandler implements ICommandHandler<StorageFileCreateCommand> {
	constructor(
		private readonly fileService: StorageFileService,
		private readonly _commandBus: CommandBus
	) {}

	public async execute(command: StorageFileCreateCommand): Promise<IStorageFile> {
		const { file } = command

		try {
			const { filePath } = file

			let fileNameString = ''
			const ext = filePath.split('.').pop()
			const prefix = 'file'
			fileNameString = `${prefix}-${moment().unix()}-${parseInt('' + Math.random() * 1000, 10)}.${ext}`

			const provider = new FileStorage().getProvider()
			const relativePath = join('files', RequestContext.currentTenantId(), fileNameString)

			// Resolve the local upload destination.
			const fullPath = resolve(provider.config.rootPath, relativePath)
			// Create the destination directory before writing.
			await fsp.mkdir(dirname(fullPath), { recursive: true })

			// Store the file using the configured provider.
			const storedFile = await provider.putFile(file.contents, relativePath)

			const { key, url: storedUrl, size, mimetype, encoding } = storedFile

			// Persist metadata for subsequent access and usage measurement.
			const createdStorageFile = await this.fileService.create({
				file: key,
				url: storedUrl,
				originalName: filePath,
				encoding,
				size,
				mimetype,
				storageProvider: `${provider.name}`.toUpperCase(),
				recordedAt: new Date()
			})

			return createdStorageFile
		} catch (error) {
			if (error instanceof HttpException) throw error
			throw new BadRequestException(error, `Can'\t create storage file`)
		}
	}
}
