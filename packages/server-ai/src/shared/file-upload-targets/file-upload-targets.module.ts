import { Module } from '@nestjs/common'
import { VolumeModule } from '../volume'
import { FileUploadTargetStrategies } from './strategies'

@Module({
    imports: [VolumeModule],
    providers: [...FileUploadTargetStrategies]
})
export class FileUploadTargetsModule {}
