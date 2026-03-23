import { Module } from '@nestjs/common'
import { FileUploadTargetStrategies } from './strategies'

@Module({
	providers: [...FileUploadTargetStrategies]
})
export class FileUploadTargetsModule {}
