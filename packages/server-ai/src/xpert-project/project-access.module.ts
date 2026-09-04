import { ProjectAccessRuntimeService } from './services/project-access-runtime.service'
import { ProjectAccessCapabilityRegistrationService } from './services/project-access-capability-registration.service'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertProject } from './entities/project.entity'
import { XpertProjectMembership } from './entities/project-membership.entity'
import { XpertProjectAccessService } from './services/project-access.service'
import { Xpert } from '../xpert/xpert.entity'
import { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'

@Module({
    imports: [TypeOrmModule.forFeature([XpertProject, XpertProjectMembership, Xpert])],
    providers: [
        ProjectAccessRuntimeService,
        ProjectAccessCapabilityRegistrationService,
        XpertProjectXpertBindingService,
        XpertProjectAccessService
    ],
    exports: [XpertProjectXpertBindingService, XpertProjectAccessService]
})
export class XpertProjectAccessModule {}
