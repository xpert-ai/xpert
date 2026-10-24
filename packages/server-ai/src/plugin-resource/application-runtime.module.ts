import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Xpert } from '../xpert/xpert.entity'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { ApplicationRuntimeService } from './application-runtime.service'

@Module({
    imports: [CqrsModule, TypeOrmModule.forFeature([PluginApplicationInstallation, Xpert, XpertWorkspace])],
    providers: [ApplicationRuntimeService],
    exports: [ApplicationRuntimeService]
})
export class ApplicationRuntimeModule {}
