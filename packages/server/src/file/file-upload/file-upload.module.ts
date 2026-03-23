import { FileUploadTargetRegistry } from '@xpert-ai/plugin-sdk'
import { Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { StorageFileModule } from '../../storage-file/storage-file.module'
import { CommandHandlers } from './commands/handlers'
import { FileUploadController } from './file-upload.controller'
import { TargetStrategies } from './strategies'
import { UploadFileService } from './upload-file.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/files', module: FileUploadModule }]),
		CqrsModule,
		DiscoveryModule,
		StorageFileModule
	],
	controllers: [FileUploadController],
	providers: [FileUploadTargetRegistry, UploadFileService, ...TargetStrategies, ...CommandHandlers],
	exports: [UploadFileService, FileUploadTargetRegistry]
})
export class FileUploadModule {}
