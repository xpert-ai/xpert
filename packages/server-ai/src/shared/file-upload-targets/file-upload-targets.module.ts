import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { VolumeModule } from '../volume'
import { FileUploadTargetStrategies } from './strategies'

@Module({
    imports: [CqrsModule, VolumeModule],
    providers: [...FileUploadTargetStrategies]
})
export class FileUploadTargetsModule {}
