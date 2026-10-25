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
import { CqrsModule } from '@nestjs/cqrs'
import { AssertProjectAssistantAccessHandler } from './commands/assert-project-assistant-access.command'
import { HasProjectTaskConversationHandler } from './queries/has-project-task-conversation.query'
import { XpertProjectTaskExecution } from './entities/project-task-execution.entity'

@Module({
    imports: [
        CqrsModule,
        TypeOrmModule.forFeature([XpertProject, XpertProjectMembership, Xpert, XpertProjectTaskExecution])
    ],
    providers: [
        ProjectContentResourceProvider,
        ProjectFilesRuntimeService,
        AssertProjectAssistantAccessHandler,
        HasProjectTaskConversationHandler,
        ProjectAccessRuntimeService,
        XpertProjectXpertBindingService,
        XpertProjectAccessService
    ],
    exports: [
        ProjectFilesRuntimeService,
        ProjectAccessRuntimeService,
        XpertProjectXpertBindingService,
        XpertProjectAccessService
    ]
})
export class XpertProjectAccessModule {}
