import { ListProjectSkillsHandler, InstallProjectSkillHandler } from './project-skills.handler'
import { PrepareProjectSkillContextHandler } from './prepare-project-skill-context.handler'
import { ReadProjectTaskAcceptanceHandler } from './read-project-task-acceptance.handler'
import { ResolveProjectTaskDurationHandler } from './resolve-project-task-duration.handler'
import { ExportProjectHandler } from './export.handler'
import { EnsureXpertProjectHandler } from './ensure-project.handler'
import { EnsureXpertProjectMemberHandler } from './ensure-project-member.handler'

export const CommandHandlers = [
    ListProjectSkillsHandler,
    InstallProjectSkillHandler,
    PrepareProjectSkillContextHandler,
    ReadProjectTaskAcceptanceHandler,
    ResolveProjectTaskDurationHandler,
    ExportProjectHandler,
    EnsureXpertProjectHandler,
    EnsureXpertProjectMemberHandler
]
