import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RuntimeCapabilityModule } from '../../shared/runtime/runtime-capability.module'
import { FileRuntimeService } from './file-runtime.service'

@Module({
    imports: [CqrsModule, RuntimeCapabilityModule],
    providers: [FileRuntimeService],
    exports: [FileRuntimeService]
})
export class FileRuntimeModule {}
