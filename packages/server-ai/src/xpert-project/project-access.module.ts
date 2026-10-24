import { ProjectContentResourceProvider } from './services/project-content-resource.provider'
import { ProjectAccessRuntimeService } from './services/project-access-runtime.service'
import { ProjectFilesRuntimeService } from './services/project-files-runtime.service'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertProject } from './entities/project.entity'
import { XpertProjectMembership } from './entities/project-membership.entity'
import { XpertProjectAccessService } from './services/project-access.service'
import { Xpert } from '../xpert/xpert.entity'
import { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'

@Module({
    imports: [TypeOrmModule.forFeature([XpertProject, XpertProjectMembership, Xpert])],
    providers: [ProjectContentResourceProvider, ProjectFilesRuntimeService, ProjectAccessRuntimeService, XpertProjectXpertBindingService, XpertProjectAccessService],
    exports: [ProjectFilesRuntimeService, ProjectAccessRuntimeService, XpertProjectXpertBindingService, XpertProjectAccessService]
})
export class XpertProjectAccessModule {}
