import { FileStorageProviderEnum, IStorageFile } from '@metad/contracts'
import { BadRequestException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import * as fsp from 'fs/promises'
import moment from 'moment'
import { dirname, join, resolve } from 'path'
import { FileStorage, RequestContext } from '../../../core'
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

			// 获取绝对路径（如果你上传需要本地路径）
			const fullPath = resolve(provider.config.rootPath, relativePath)
			// 确保目录存在
			await fsp.mkdir(dirname(fullPath), { recursive: true })

			// 上传文件内容（假设 file.url 是临时地址或可访问的路径）
			const storedFile = await provider.putFile(file.contents, relativePath)

			const { key, url: storedUrl, size, mimetype, encoding } = storedFile

			// 保存文件元信息到 storageFileService
			const createdStorageFile = await this.fileService.create({
				file: key,
				url: storedUrl,
				originalName: filePath,
				encoding,
				size,
				mimetype,
				storageProvider: provider.name.toUpperCase() as FileStorageProviderEnum,
				recordedAt: new Date()
			})

			return createdStorageFile
		} catch (error) {
			throw new BadRequestException(error, `Can'\t create storage file`)
		}
	}
}
