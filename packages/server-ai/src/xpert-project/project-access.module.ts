import { ProjectAccessRuntimeService } from './services/project-access-runtime.service'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertProject } from './entities/project.entity'
import { XpertProjectMembership } from './entities/project-membership.entity'
import { XpertProjectAccessService } from './services/project-access.service'
import { Xpert } from '../xpert/xpert.entity'
import { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'
import { CqrsModule } from '@nestjs/cqrs'
import { AssertProjectAssistantAccessHandler } from './commands/assert-project-assistant-access.command'

@Module({
    imports: [CqrsModule, TypeOrmModule.forFeature([XpertProject, XpertProjectMembership, Xpert])],
    providers: [
        AssertProjectAssistantAccessHandler,
        ProjectAccessRuntimeService,
        XpertProjectXpertBindingService,
        XpertProjectAccessService
    ],
    exports: [ProjectAccessRuntimeService, XpertProjectXpertBindingService, XpertProjectAccessService]
})
export class XpertProjectAccessModule {}
