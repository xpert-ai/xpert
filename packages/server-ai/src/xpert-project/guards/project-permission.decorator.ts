import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { SetMetadata } from '@nestjs/common'

export const XPERT_PROJECT_PERMISSION = 'xpert-project:permission'

// Project guards resolve collection grants or the current Project ACL. Requiring
// the same tenant-wide grant again would deny ordinary Project owners/managers.
export const ProjectPermission = (permission: AIPermissionsEnum) => SetMetadata(XPERT_PROJECT_PERMISSION, permission)
