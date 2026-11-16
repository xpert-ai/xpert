import { ListProjectSkillsHandler, InstallProjectSkillHandler } from './project-skills.handler'
import { PrepareProjectSkillContextHandler } from './prepare-project-skill-context.handler'
import { ReadProjectTaskAcceptanceHandler } from './read-project-task-acceptance.handler'
import { ReadProjectTaskCandidateHandler } from './read-project-task-candidate.handler'
import { ResolveProjectTaskDurationHandler } from './resolve-project-task-duration.handler'
import { ExportProjectHandler } from './export.handler'
import { EnsureXpertProjectHandler } from './ensure-project.handler'
import { EnsureXpertProjectMemberHandler } from './ensure-project-member.handler'

export const CommandHandlers = [
    ListProjectSkillsHandler,
    InstallProjectSkillHandler,
    PrepareProjectSkillContextHandler,
    ReadProjectTaskAcceptanceHandler,
    ReadProjectTaskCandidateHandler,
    ResolveProjectTaskDurationHandler,
    ExportProjectHandler,
    EnsureXpertProjectHandler,
    EnsureXpertProjectMemberHandler
]
