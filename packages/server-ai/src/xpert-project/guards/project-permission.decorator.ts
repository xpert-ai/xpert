import { Permissions } from '@xpert-ai/server-core'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { applyDecorators, SetMetadata } from '@nestjs/common'

export const XPERT_PROJECT_PERMISSION = 'xpert-project:permission'

export const ProjectPermission = (permission: AIPermissionsEnum) => applyDecorators(
    Permissions(permission), SetMetadata(XPERT_PROJECT_PERMISSION, permission)
)
