import { GroupComposerController } from './group-composer.controller'
import { GroupsController } from './group.controller'
import { GroupViewsController, GroupWorkbenchContextController } from './group-workbench.controller'
import { GroupViewFilesController } from './group-view-files.controller'
import { GroupProjectController } from './group-project.controller'

export const GROUP_CONTROLLERS = [
    GroupProjectController,
    GroupsController,
    GroupComposerController,
    GroupViewsController,
    GroupWorkbenchContextController,
    GroupViewFilesController
]
