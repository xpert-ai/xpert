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
import { WithStorageBudgetCommand } from '../../../shared/storage-budget.command'

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
			return await this._commandBus.execute(
				new WithStorageBudgetCommand(
					{
						kind: 'object',
						owner: {
							tenantId: RequestContext.currentTenantId(),
							organizationId: RequestContext.getOrganizationId(),
							userId: RequestContext.currentUserId()
						},
						provider: provider.name,
						key: relativePath,
						bytes: Buffer.byteLength(file.contents ?? '')
					},
					async () => {
						// Resolve the provider-local destination path.
						const fullPath = resolve(provider.config.rootPath, relativePath)
						// Create the parent directory after budget admission.
						await fsp.mkdir(dirname(fullPath), { recursive: true })

						// Persist the generated contents through the selected provider.
						const storedFile = await provider.putFile(file.contents, relativePath)

						const { key, url: storedUrl, size, mimetype, encoding } = storedFile

						// Record metadata only after the provider confirms the write.
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
					}
				)
			)
		} catch (error) {
			if (error instanceof HttpException) throw error
			throw new BadRequestException(error, `Can'\t create storage file`)
		}
	}
}
