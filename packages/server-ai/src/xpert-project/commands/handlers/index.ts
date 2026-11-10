import { ResolveProjectTaskDurationHandler } from './resolve-project-task-duration.handler'
import { ExportProjectHandler } from './export.handler'
import { EnsureXpertProjectHandler } from './ensure-project.handler'
import { EnsureXpertProjectMemberHandler } from './ensure-project-member.handler'

export const CommandHandlers = [ResolveProjectTaskDurationHandler, ExportProjectHandler, EnsureXpertProjectHandler, EnsureXpertProjectMemberHandler]
